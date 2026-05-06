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
  provider: "tesseract" | "cloudflare" | "gemini" | "huggingface" | "google_vision" | "manual";
}

// ─── Image preprocessing — upscale + sharpen + grayscale ────────────────────

async function preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 0;
  // Upscale to at least 1600px wide for better OCR accuracy
  const scale = w > 0 && w < 1600 ? Math.min(4, Math.ceil(1600 / w)) : 1;

  return sharp(imageBuffer)
    .resize(w > 0 ? w * scale : undefined, undefined, { kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalise()          // auto contrast stretch
    .sharpen({ sigma: 1.5 })
    .toBuffer();
}

// ─── Extract best product name from OCR text ────────────────────────────────

function extractName(text: string): string | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 2 && /[a-zA-Zа-яА-ЯёЁ]/.test(l));

  if (lines.length === 0) return null;

  // Score: prefer lines with high letter ratio and longer length
  const scored = lines.map((l) => {
    const letters = (l.match(/[a-zA-Zа-яА-ЯёЁ]/g) ?? []).length;
    return { line: l, score: l.length * (letters / l.length) };
  }).sort((a, b) => b.score - a.score);

  // Take top 2 distinct lines and join
  const top: string[] = [];
  for (const { line } of scored) {
    if (top.length >= 2) break;
    // Skip if substring of already included line
    if (!top.some((t) => t.toLowerCase().includes(line.toLowerCase()) || line.toLowerCase().includes(t.toLowerCase()))) {
      top.push(line.replace(/[|\\/<>{}[\]@#$%^*]/g, "").trim());
    }
  }

  const name = top.join(" ").replace(/\s{2,}/g, " ").trim();
  return name.length >= 2 ? name : null;
}

// ─── Tesseract OCR (local, free, reads Russian + English) ────────────────────

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

    // Try multiple PSM modes: 6 (block), 11 (sparse) — sparse is better for product labels
    const recognize = (tesseract as unknown as { recognize: (path: string, config: Record<string, unknown>) => Promise<string> }).recognize;

    const results = await Promise.allSettled([
      recognize(tmpPath, { lang: "eng+rus", oem: 1, psm: 11 }), // sparse text — best for labels
      recognize(tmpPath, { lang: "eng+rus", oem: 1, psm: 6 }),  // single text block
    ]);

    const texts = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map((r) => r.value);

    // Pick the result with the most alphabetic characters
    const best = texts.reduce<string | null>((acc, t) => {
      const letters = (t.match(/[a-zA-Zа-яА-ЯёЁ]/g) ?? []).length;
      const accLetters = (acc?.match(/[a-zA-Zа-яА-ЯёЁ]/g) ?? []).length;
      return letters > accLetters ? t : acc;
    }, null);

    if (!best) return null;

    const name = extractName(best);
    if (!name) return null;

    console.log("[Tesseract] recognized:", name);
    return { name, brand: null, category: null, confidence: 0.7, provider: "tesseract" };
  } catch (err) {
    console.error("[Tesseract] error:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

// ─── Google Gemini Flash ──────────────────────────────────────────────────────

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
            { text: `This is a product photo (price tag or package). Extract the exact product name and brand. Reply ONLY with valid JSON: {"name":"full product name with size/volume if visible","brand":"brand name or null","category":"food/drink/household/electronics/other or null","confidence":0.0}` },
            { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      console.error(`[Gemini] HTTP ${res.status}`);
      return null;
    }

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
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.85,
      provider: "gemini",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Cloudflare Workers AI ────────────────────────────────────────────────────

async function recognizeWithCloudflare(imageBase64: string): Promise<AiResult | null> {
  if (!env.CLOUDFLARE_AI_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const imageBytes = Array.from(Buffer.from(imageBase64, "base64").subarray(0, 500_000));

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
          prompt: "What is the product name and brand shown in this image? Reply with only the product name.",
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) return null;

    type CfResponse = { result?: { description?: string; response?: string } };
    const data = (await res.json()) as CfResponse;
    const text = (data.result?.description ?? data.result?.response ?? "").trim();
    if (!text || text.length < 2) return null;

    const clean = text.replace(/^(ASSISTANT:|assistant:)\s*/i, "").split("\n")[0].trim();
    if (clean.length > 1 && clean.length < 120) {
      console.log("[Cloudflare] recognized:", clean);
      return { name: clean, brand: null, category: null, confidence: 0.7, provider: "cloudflare" };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Main: Gemini → Tesseract → Cloudflare → manual ─────────────────────────
// Gemini first (best quality), Tesseract as offline fallback

export async function recognizeProduct(imageBuffer: Buffer): Promise<AiResult> {
  const imageBase64 = imageBuffer.toString("base64");

  const result =
    (await recognizeWithGemini(imageBase64)) ??
    (await recognizeWithTesseract(imageBuffer)) ??
    (await recognizeWithCloudflare(imageBase64));

  return result ?? { name: "", brand: null, category: null, confidence: 0, provider: "manual" };
}
