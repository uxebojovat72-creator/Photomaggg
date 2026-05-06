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

// ─── Noise filter ─────────────────────────────────────────────────────────────

const NOISE_STARTS = [
  "состав", "хранить", "хранение", "изготовитель", "производитель",
  "гост", "масса", "нетто", "брутто", "калорий", "белки", "жиры",
  "углеводы", "срок", "годности", "содержит", "аллергены",
  "ingredients", "nutrition", "serving", "contains", "www",
];

function isNoiseLine(line: string): boolean {
  const lower = line.toLowerCase().trim();
  const firstWord = lower.split(/[\s:,.]/)[0];
  if (NOISE_STARTS.some((n) => firstWord.startsWith(n))) return true;
  // Too many digits
  const digits = (line.match(/\d/g) ?? []).length;
  if (digits / line.replace(/\s/g, "").length > 0.4) return true;
  // Contains URL/email
  if (/@|www\.|http|\.ru\b|\.com\b/.test(lower)) return true;
  // Too many garbage chars
  const garbage = (line.match(/[^a-zA-Zа-яА-ЯёЁ0-9\s.,!%-]/g) ?? []).length;
  if (garbage / line.length > 0.25) return true;
  // Mostly single-char words (OCR noise from barcodes)
  const words = line.trim().split(/\s+/);
  const longWords = words.filter((w) => w.length >= 3);
  if (longWords.length === 0) return true;  // no real words at all

  return false;
}

function extractBestName(text: string): string | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 4 && /[a-zA-Zа-яА-ЯёЁ]{2,}/.test(l) && !isNoiseLine(l));

  if (lines.length === 0) return null;

  const scored = lines.map((l) => {
    const cyrillic = (l.match(/[а-яА-ЯёЁ]/g) ?? []).length;
    const latin = (l.match(/[a-zA-Z]/g) ?? []).length;
    const letters = cyrillic + latin;
    const cyrBonus = cyrillic > 0 ? 1.3 : 1.0;
    return { line: l, score: l.length * (letters / Math.max(l.length, 1)) * cyrBonus };
  }).sort((a, b) => b.score - a.score);

  const top: string[] = [];
  for (const { line } of scored) {
    if (top.length >= 2) break;
    const clean = line.replace(/[|\\/<>{}[\]@#$%^*=~"'`]/g, "").trim();
    if (clean.length < 3) continue;
    if (!top.some((t) =>
      t.toLowerCase().includes(clean.toLowerCase()) ||
      clean.toLowerCase().includes(t.toLowerCase())
    )) {
      top.push(clean);
    }
  }

  if (top.length === 0) return null;
  const name = top.join(" ").replace(/\s{2,}/g, " ").trim();
  return name.length >= 3 ? name : null;
}

// ─── Tesseract OCR — Tesseract 5 LSTM works best on color images ──────────────

export async function recognizeWithTesseract(imageBuffer: Buffer): Promise<AiResult | null> {
  const recognize = (tesseract as unknown as {
    recognize: (path: string, config: Record<string, unknown>) => Promise<string>;
  }).recognize;

  // Prepare variants: color (dark text) + inverted grayscale (white text on colored bg)
  let colorBuf: Buffer;
  let invertBuf: Buffer;
  try {
    const meta = await sharp(imageBuffer).metadata();
    const w = meta.width ?? 0;
    const needsUpscale = w > 0 && w < 1800;
    const scale = needsUpscale ? Math.min(3, Math.ceil(1800 / w)) : 1;

    const base = needsUpscale
      ? sharp(imageBuffer).resize(Math.round(w * scale), undefined, { kernel: sharp.kernel.lanczos3 })
      : sharp(imageBuffer);

    [colorBuf, invertBuf] = await Promise.all([
      base.clone().toBuffer(),                              // original color — dark text on light bg
      base.clone().grayscale().normalise().negate().toBuffer(), // inverted — white text on dark/colored bg
    ]);
  } catch {
    colorBuf = imageBuffer;
    invertBuf = imageBuffer;
  }

  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tmpColor = join(tmpdir(), `ocr_${id}_c.jpg`);
  const tmpInvert = join(tmpdir(), `ocr_${id}_i.png`);
  try {
    await Promise.all([writeFile(tmpColor, colorBuf), writeFile(tmpInvert, invertBuf)]);

    // PSM 11 (sparse text, best for labels) on both variants
    const [rc11, ri11, rc3] = await Promise.allSettled([
      recognize(tmpColor,  { lang: "eng+rus", oem: 1, psm: 11 }), // color, sparse
      recognize(tmpInvert, { lang: "eng+rus", oem: 1, psm: 11 }), // inverted, sparse — catches white text
      recognize(tmpColor,  { lang: "eng+rus", oem: 1, psm: 3 }),  // color, auto
    ]);

    const texts = [rc11, ri11, rc3]
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map((r) => r.value);

    // Pick the text with most valid Cyrillic+Latin letters
    const best = texts.reduce<string | null>((acc, t) => {
      const letters = (t.match(/[a-zA-Zа-яА-ЯёЁ]/g) ?? []).length;
      const accLetters = (acc?.match(/[a-zA-Zа-яА-ЯёЁ]/g) ?? []).length;
      return letters > accLetters ? t : acc;
    }, null);

    if (!best) return null;

    const name = extractBestName(best);
    if (!name) {
      console.log("[Tesseract] no valid name found in OCR text");
      return null;
    }

    console.log("[Tesseract] recognized:", name);
    return { name, brand: null, category: null, confidence: 0.7, provider: "tesseract" };
  } catch (err) {
    console.error("[Tesseract] error:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await Promise.allSettled([unlink(tmpColor), unlink(tmpInvert)]);
  }
}

// ─── Gemini (optional backup) ─────────────────────────────────────────────────

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

// ─── Main chain ───────────────────────────────────────────────────────────────

export async function recognizeProduct(imageBuffer: Buffer): Promise<AiResult> {
  const result =
    (await recognizeWithTesseract(imageBuffer)) ??
    (await recognizeWithGemini(imageBuffer.toString("base64")));

  return result ?? { name: "", brand: null, category: null, confidence: 0, provider: "manual" };
}
