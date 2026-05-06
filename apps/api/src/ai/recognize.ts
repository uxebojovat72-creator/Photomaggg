import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import tesseract from "node-tesseract-ocr";
import { env } from "../lib/env.js";

export interface AiResult {
  name: string;
  brand: string | null;
  category: string | null;
  confidence: number;
  provider: "tesseract" | "cloudflare" | "gemini" | "huggingface" | "google_vision" | "manual";
}

// ─── Tesseract OCR (local, free, reads Russian + English) ────────────────────

export async function recognizeWithTesseract(imageBuffer: Buffer): Promise<AiResult | null> {
  const tmpPath = join(tmpdir(), `ocr_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  try {
    await writeFile(tmpPath, imageBuffer);

    const text = await (tesseract as unknown as { recognize: (path: string, config: Record<string, unknown>) => Promise<string> })
      .recognize(tmpPath, { lang: "eng+rus", oem: 1, psm: 3 });

    const lines = text
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.length >= 3 && /[a-zA-Zа-яА-Я0-9]/.test(l));

    if (lines.length === 0) return null;

    // Find the most prominent line (longest meaningful word cluster)
    const best = lines.reduce((a: string, b: string) => (b.length > a.length ? b : a), lines[0]);
    const name = best.replace(/[|\\/<>{}[\]]/g, "").trim();
    if (name.length < 2) return null;

    return { name, brand: null, category: null, confidence: 0.65, provider: "tesseract" };
  } catch (err) {
    console.error("[Tesseract] error:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await unlink(tmpPath).catch(() => {});
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
          prompt: "What product or brand name is shown in this image? Reply with only the product name.",
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      console.error(`[Cloudflare AI] HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return null;
    }

    type CfResponse = { result?: { description?: string; response?: string }; success?: boolean };
    const data = (await res.json()) as CfResponse;
    const text = (data.result?.description ?? data.result?.response ?? "").trim();
    if (!text || text.length < 2) return null;

    const clean = text.replace(/^(ASSISTANT:|assistant:)\s*/i, "").split("\n")[0].trim();
    if (clean.length > 1 && clean.length < 120) {
      return { name: clean, brand: null, category: null, confidence: 0.7, provider: "cloudflare" };
    }
    return null;
  } catch (err) {
    console.error("[Cloudflare AI] error:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Google Gemini Flash ──────────────────────────────────────────────────────

async function recognizeWithGemini(imageBase64: string): Promise<AiResult | null> {
  if (!env.GEMINI_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: `Look at this product or price tag image. Extract the product name and brand. Respond ONLY with valid JSON: {"name":"product name","brand":"brand or null","category":"food/drink/household/electronics/other or null","confidence":0.0}` },
            { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 150 },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      console.error(`[Gemini] HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
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

    return {
      name: parsed.name,
      brand: parsed.brand ?? null,
      category: parsed.category ?? null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
      provider: "gemini",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Main: Tesseract → Cloudflare → Gemini → manual ─────────────────────────

export async function recognizeProduct(imageBuffer: Buffer): Promise<AiResult> {
  const imageBase64 = imageBuffer.toString("base64");

  const result =
    (await recognizeWithTesseract(imageBuffer)) ??
    (await recognizeWithCloudflare(imageBase64)) ??
    (await recognizeWithGemini(imageBase64));

  return result ?? { name: "", brand: null, category: null, confidence: 0, provider: "manual" };
}
