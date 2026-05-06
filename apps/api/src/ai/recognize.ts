import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import tesseract from "node-tesseract-ocr";
import sharp from "sharp";
import { env } from "../lib/env.js";

export interface AiResult {
  name: string;
  brand: string | null;
  category: string | null;
  confidence: number;
  provider: "ollama" | "tesseract" | "cloudflare" | "gemini" | "huggingface" | "google_vision" | "manual";
}

// ─── Ollama (local, unlimited, free) ─────────────────────────────────────────

async function recognizeWithOllama(imageBase64: string): Promise<AiResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(`${env.OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        prompt:
          "Look at this product image. Extract the exact product name, brand, and size/volume if visible. " +
          'Reply ONLY with valid JSON: {"name":"full product name with size","brand":"brand or null","category":"food/drink/household/electronics/other or null","confidence":0.0}',
        images: [imageBase64],
        stream: false,
        options: { temperature: 0.1 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`[Ollama] HTTP ${res.status}`);
      return null;
    }

    type OllamaResponse = { response?: string };
    const data = (await res.json()) as OllamaResponse;
    const text = data.response?.trim();
    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Model returned plain text instead of JSON — use it directly
      const clean = text.split("\n")[0].trim();
      if (clean.length > 1 && clean.length < 150) {
        console.log("[Ollama] plain text:", clean);
        return { name: clean, brand: null, category: null, confidence: 0.75, provider: "ollama" };
      }
      return null;
    }

    type ParsedResult = { name?: string; brand?: string | null; category?: string | null; confidence?: number };
    const parsed = JSON.parse(jsonMatch[0]) as ParsedResult;
    if (typeof parsed.name !== "string" || !parsed.name) return null;

    console.log("[Ollama] recognized:", parsed.name);
    return {
      name: parsed.name,
      brand: parsed.brand ?? null,
      category: parsed.category ?? null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
      provider: "ollama",
    };
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      console.error("[Ollama] error:", err instanceof Error ? err.message : err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Image preprocessing ─────────────────────────────────────────────────────

async function preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 0;
  const scale = w > 0 && w < 1600 ? Math.min(4, Math.ceil(1600 / w)) : 1;

  return sharp(imageBuffer)
    .resize(w > 0 ? w * scale : undefined, undefined, { kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalise()
    .sharpen({ sigma: 1.5 })
    .toBuffer();
}

// ─── Garbage detection ───────────────────────────────────────────────────────

function isGarbage(text: string): boolean {
  const letters = (text.match(/[a-zA-Zа-яА-ЯёЁ]/g) ?? []).length;
  const total = text.replace(/\s/g, "").length;
  if (total === 0) return true;
  const letterRatio = letters / total;
  const words = text.trim().split(/\s+/);
  const singleCharWords = words.filter((w) => w.length === 1).length;
  const singleRatio = singleCharWords / words.length;
  return letterRatio < 0.5 || singleRatio > 0.4;
}

function extractName(text: string): string | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && /[a-zA-Zа-яА-ЯёЁ]/.test(l) && !isGarbage(l));

  if (lines.length === 0) return null;

  const scored = lines.map((l) => {
    const letters = (l.match(/[a-zA-Zа-яА-ЯёЁ]/g) ?? []).length;
    return { line: l, score: l.length * (letters / l.length) };
  }).sort((a, b) => b.score - a.score);

  const top: string[] = [];
  for (const { line } of scored) {
    if (top.length >= 2) break;
    if (!top.some((t) => t.toLowerCase().includes(line.toLowerCase()) || line.toLowerCase().includes(t.toLowerCase()))) {
      top.push(line.replace(/[|\\/<>{}[\]@#$%^*=~]/g, "").trim());
    }
  }

  const name = top.join(" ").replace(/\s{2,}/g, " ").trim();
  return name.length >= 2 ? name : null;
}

// ─── Tesseract OCR (offline fallback) ────────────────────────────────────────

export async function recognizeWithTesseract(imageBuffer: Buffer): Promise<AiResult | null> {
  let processed: Buffer;
  try {
    processed = await preprocessImage(imageBuffer);
  } catch {
    processed = imageBuffer;
  }

  const tmpPath = join(tmpdir(), `ocr_${Date.now()}_${Math.random().toString(36).slice(2)}.png`);
  try {
    await writeFile(tmpPath, processed);

    const recognize = (tesseract as unknown as {
      recognize: (path: string, config: Record<string, unknown>) => Promise<string>;
    }).recognize;

    const results = await Promise.allSettled([
      recognize(tmpPath, { lang: "eng+rus", oem: 1, psm: 11 }),
      recognize(tmpPath, { lang: "eng+rus", oem: 1, psm: 6 }),
    ]);

    const best = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map((r) => r.value)
      .reduce<string | null>((acc, t) => {
        const letters = (t.match(/[a-zA-Zа-яА-ЯёЁ]/g) ?? []).length;
        const accLetters = (acc?.match(/[a-zA-Zа-яА-ЯёЁ]/g) ?? []).length;
        return letters > accLetters ? t : acc;
      }, null);

    if (!best) return null;

    const name = extractName(best);
    if (!name) return null;

    console.log("[Tesseract] recognized:", name);
    return { name, brand: null, category: null, confidence: 0.65, provider: "tesseract" };
  } catch (err) {
    console.error("[Tesseract] error:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

// ─── Gemini (optional, if key available and not over quota) ──────────────────

async function recognizeWithGemini(imageBase64: string): Promise<AiResult | null> {
  if (!env.GEMINI_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: `This is a product photo. Extract the exact product name, brand, and size. Reply ONLY with valid JSON: {"name":"full product name with size","brand":"brand or null","category":"food/drink/household/electronics/other or null","confidence":0.0}` },
            { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) return null;

    type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const data = (await res.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return null;

    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    type ParsedResult = { name?: string; brand?: string | null; category?: string | null; confidence?: number };
    const parsed = JSON.parse(clean) as ParsedResult;
    if (typeof parsed.name !== "string" || !parsed.name) return null;

    console.log("[Gemini] recognized:", parsed.name);
    return {
      name: parsed.name,
      brand: parsed.brand ?? null,
      category: parsed.category ?? null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.9,
      provider: "gemini",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Main: Ollama → Gemini → Tesseract → manual ──────────────────────────────

export async function recognizeProduct(imageBuffer: Buffer): Promise<AiResult> {
  const imageBase64 = imageBuffer.toString("base64");

  const result =
    (await recognizeWithOllama(imageBase64)) ??
    (await recognizeWithGemini(imageBase64)) ??
    (await recognizeWithTesseract(imageBuffer));

  return result ?? { name: "", brand: null, category: null, confidence: 0, provider: "manual" };
}
