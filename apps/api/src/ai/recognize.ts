import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import tesseract from "node-tesseract-ocr";
import sharp from "sharp";
import { env } from "../lib/env.js";

// ─── Groq Vision (llama-3.2-11b-vision — 7000 req/day free) ──────────────────

async function recognizeWithGroq(imageBuffer: Buffer): Promise<AiResult | null> {
  if (!env.GROQ_API_KEY) return null;

  let compressed: Buffer;
  try {
    compressed = await sharp(imageBuffer)
      .resize(896, 896, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch {
    compressed = imageBuffer;
  }

  const base64 = compressed.toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${base64}` },
              },
              {
                type: "text",
                text: 'Это фото товара или ценника. Определи название товара и бренд. Ответь ТОЛЬКО JSON без пояснений: {"name":"точное название с объёмом/весом если видно","brand":"бренд или null","category":"food/drink/household/electronics/cosmetics/other или null","confidence":0.0}',
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error(`[Groq] HTTP ${res.status}:`, err.slice(0, 200));
      return null;
    }

    type GroqResponse = { choices?: Array<{ message?: { content?: string } }> };
    const data = (await res.json()) as GroqResponse;
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    type Parsed = { name?: string; brand?: string | null; category?: string | null; confidence?: number };
    const parsed = JSON.parse(jsonMatch[0]) as Parsed;
    if (typeof parsed.name !== "string" || !parsed.name.trim()) return null;

    console.log("[Groq] recognized:", parsed.name);
    return {
      name: parsed.name.trim(),
      brand: parsed.brand ?? null,
      category: parsed.category ?? null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.9,
      provider: "gemini", // reuse existing provider type label
    };
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      console.error("[Groq] error:", err instanceof Error ? err.message : err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface AiResult {
  name: string;
  brand: string | null;
  category: string | null;
  confidence: number;
  provider: "ollama" | "tesseract" | "cloudflare" | "gemini" | "huggingface" | "google_vision" | "manual";
}

// ─── Cloudflare Workers AI ────────────────────────────────────────────────────
// uform-gen2-qwen-500m — vision model, free with Cloudflare account

async function recognizeWithCloudflare(imageBuffer: Buffer): Promise<AiResult | null> {
  if (!env.CLOUDFLARE_AI_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) return null;

  // Resize to 896px (optimal for uform-gen2) and convert to JPEG ~150-200 KB
  let compressed: Buffer;
  try {
    compressed = await sharp(imageBuffer)
      .resize(896, 896, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch {
    compressed = imageBuffer;
  }

  const imageBytes = Array.from(new Uint8Array(compressed));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/unum/uform-gen2-qwen-500m`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CLOUDFLARE_AI_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: imageBytes,
          prompt:
            "This is a product photo. What is the exact product name and brand? " +
            "Include size/volume if visible. Reply with the product name only, nothing else.",
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error(`[Cloudflare] HTTP ${res.status}:`, err.slice(0, 200));
      return null;
    }

    type CfResponse = { result?: { description?: string; response?: string }; success?: boolean };
    const data = (await res.json()) as CfResponse;
    const text = (data.result?.description ?? data.result?.response ?? "").trim();
    if (!text || text.length < 2) return null;

    const clean = text
      .replace(/^(ASSISTANT:|assistant:|User:|user:)\s*/i, "")
      .split("\n")[0]
      .trim();

    if (clean.length >= 2 && clean.length <= 150) {
      console.log("[Cloudflare] recognized:", clean);
      return { name: clean, brand: null, category: null, confidence: 0.75, provider: "cloudflare" };
    }
    return null;
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      console.error("[Cloudflare] error:", err instanceof Error ? err.message : err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Gemini Flash (fallback if key available) ─────────────────────────────────

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
            { text: `Это фото товара. Найди название товара и бренд. Ответь ТОЛЬКО JSON: {"name":"название с объёмом/весом","brand":"бренд или null","category":"food/drink/household/electronics/other или null","confidence":0.0}` },
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

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    type ParsedResult = { name?: string; brand?: string | null; category?: string | null; confidence?: number };
    const parsed = JSON.parse(jsonMatch[0]) as ParsedResult;
    if (typeof parsed.name !== "string" || !parsed.name) return null;

    console.log("[Gemini] recognized:", parsed.name);
    return {
      name: parsed.name, brand: parsed.brand ?? null,
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

// ─── Tesseract (last resort — works for clean labels with dark text) ──────────

export async function recognizeWithTesseract(imageBuffer: Buffer): Promise<AiResult | null> {
  const tmpPath = join(tmpdir(), `ocr_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  try {
    await writeFile(tmpPath, imageBuffer);

    const recognize = (tesseract as unknown as {
      recognize: (path: string, config: Record<string, unknown>) => Promise<string>;
    }).recognize;

    const text = await recognize(tmpPath, { lang: "eng+rus", oem: 1, psm: 11 });

    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => {
        if (l.length < 4) return false;
        if (!/[а-яА-ЯёЁa-zA-Z]{2,}/.test(l)) return false;
        const words = l.split(/\s+/);
        return words.some((w) => w.length >= 3);
      });

    if (lines.length === 0) return null;

    const scored = lines.map((l) => {
      const cyr = (l.match(/[а-яА-ЯёЁ]/g) ?? []).length;
      const lat = (l.match(/[a-zA-Z]/g) ?? []).length;
      return { line: l, score: l.length * ((cyr + lat) / l.length) * (cyr > 0 ? 1.3 : 1) };
    }).sort((a, b) => b.score - a.score);

    const name = scored[0].line.replace(/[|\\/<>{}[\]@#$%^*=~"'`]/g, "").trim();
    if (name.length < 3) return null;

    console.log("[Tesseract] recognized:", name);
    return { name, brand: null, category: null, confidence: 0.6, provider: "tesseract" };
  } catch (err) {
    console.error("[Tesseract] error:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

// ─── Main: Cloudflare → Gemini → Tesseract → manual ─────────────────────────

export async function recognizeProduct(imageBuffer: Buffer): Promise<AiResult> {
  const imageBase64 = imageBuffer.toString("base64");

  const result =
    (await recognizeWithGroq(imageBuffer)) ??
    (await recognizeWithCloudflare(imageBuffer)) ??
    (await recognizeWithGemini(imageBase64)) ??
    (await recognizeWithTesseract(imageBuffer));

  return result ?? { name: "", brand: null, category: null, confidence: 0, provider: "manual" };
}
