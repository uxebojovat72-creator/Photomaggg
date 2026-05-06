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

// ─── Words to ignore (common label noise, not product names) ─────────────────

const NOISE_WORDS = new Set([
  "состав", "хранить", "хранение", "изготовитель", "производитель",
  "гост", "масса", "нетто", "брутто", "калорий", "белки", "жиры",
  "углеводы", "энергетическая", "ценность", "срок", "годности",
  "без", "содержит", "аллергены", "прочитайте", "внимание",
  "подробнее", "ingredients", "nutrition", "serving", "contains",
  "www", "http", "тел", "адрес", "россия", "москва",
]);

function isNoiseLine(line: string): boolean {
  const lower = line.toLowerCase().trim();
  // Starts with a noise keyword
  if (NOISE_WORDS.has(lower.split(/[\s:]/)[0])) return true;
  // Mostly digits (barcode, weight, date)
  const digits = (line.match(/\d/g) ?? []).length;
  if (digits / line.length > 0.5) return true;
  // Contains email/URL patterns
  if (/@|www\.|http|\.ru|\.com/.test(lower)) return true;
  // Too many special chars
  const specials = (line.match(/[^a-zA-Zа-яА-ЯёЁ0-9\s]/g) ?? []).length;
  if (specials / line.length > 0.35) return true;
  // Single char words dominate
  const words = line.trim().split(/\s+/);
  const singles = words.filter((w) => w.length === 1).length;
  if (singles / words.length > 0.4) return true;

  return false;
}

function extractBestName(text: string): string | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => {
      if (l.length < 3) return false;
      if (!/[a-zA-Zа-яА-ЯёЁ]/.test(l)) return false;
      if (isNoiseLine(l)) return false;
      return true;
    });

  if (lines.length === 0) return null;

  // Score: longer lines with more Cyrillic letters score higher
  const scored = lines.map((l) => {
    const cyrillic = (l.match(/[а-яА-ЯёЁ]/g) ?? []).length;
    const latin = (l.match(/[a-zA-Z]/g) ?? []).length;
    const letters = cyrillic + latin;
    const bonus = cyrillic > 0 ? 1.3 : 1.0; // prefer Russian text
    return { line: l, score: l.length * (letters / l.length) * bonus };
  }).sort((a, b) => b.score - a.score);

  // Combine top 2 lines (brand + product name)
  const top: string[] = [];
  for (const { line } of scored) {
    if (top.length >= 2) break;
    const clean = line.replace(/[|\\/<>{}[\]@#$%^*=~"'`]/g, "").trim();
    if (clean.length < 2) continue;
    // Skip duplicates or substrings
    if (!top.some((t) =>
      t.toLowerCase().includes(clean.toLowerCase()) ||
      clean.toLowerCase().includes(t.toLowerCase())
    )) {
      top.push(clean);
    }
  }

  if (top.length === 0) return null;
  const name = top.join(" ").replace(/\s{2,}/g, " ").trim();
  return name.length >= 2 ? name : null;
}

// ─── Image preprocessing — multiple variants for best OCR coverage ────────────

async function buildVariants(imageBuffer: Buffer): Promise<Buffer[]> {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 800;
  // Upscale to at least 2000px — bigger = better OCR accuracy
  const scale = w > 0 && w < 2000 ? Math.min(4, Math.ceil(2000 / w)) : 1;

  const base = sharp(imageBuffer).resize(
    w > 0 ? Math.round(w * scale) : undefined,
    undefined,
    { kernel: sharp.kernel.lanczos3 }
  );

  const [v1, v2, v3] = await Promise.all([
    // Variant 1: grayscale + normalise + sharpen (general purpose)
    base.clone().grayscale().normalise().sharpen({ sigma: 2 }).toBuffer(),
    // Variant 2: binarized high-contrast (dark text on light bg)
    base.clone().grayscale().normalise().linear(1.8, -60).threshold(128).toBuffer(),
    // Variant 3: inverted (white text on colored/dark bg — common on Russian products)
    base.clone().grayscale().normalise().negate().sharpen({ sigma: 1.5 }).toBuffer(),
  ]);

  return [v1, v2, v3];
}

// ─── Tesseract OCR ────────────────────────────────────────────────────────────

export async function recognizeWithTesseract(imageBuffer: Buffer): Promise<AiResult | null> {
  let variants: Buffer[];
  try {
    variants = await buildVariants(imageBuffer);
  } catch {
    variants = [imageBuffer];
  }

  const recognize = (tesseract as unknown as {
    recognize: (path: string, config: Record<string, unknown>) => Promise<string>;
  }).recognize;

  // Write all variants to tmp files
  const tmpFiles = await Promise.all(
    variants.map(async (buf, i) => {
      const p = join(tmpdir(), `ocr_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}.png`);
      await writeFile(p, buf);
      return p;
    })
  );

  try {
    // Try each variant × 2 PSM modes (PSM 11 sparse + PSM 6 block)
    const tasks = tmpFiles.flatMap((path) => [
      recognize(path, { lang: "eng+rus", oem: 1, psm: 11 }),
      recognize(path, { lang: "eng+rus", oem: 1, psm: 6 }),
    ]);

    const results = await Promise.allSettled(tasks);
    const texts = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map((r) => r.value);

    // Pick text with most valid letters
    const best = texts.reduce<string | null>((acc, t) => {
      const letters = (t.match(/[a-zA-Zа-яА-ЯёЁ]/g) ?? []).length;
      const accLetters = (acc?.match(/[a-zA-Zа-яА-ЯёЁ]/g) ?? []).length;
      return letters > accLetters ? t : acc;
    }, null);

    if (!best) return null;

    const name = extractBestName(best);
    if (!name) return null;

    console.log("[Tesseract] recognized:", name);
    return { name, brand: null, category: null, confidence: 0.7, provider: "tesseract" };
  } catch (err) {
    console.error("[Tesseract] error:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await Promise.allSettled(tmpFiles.map((p) => unlink(p)));
  }
}

// ─── Gemini (optional backup if key available) ────────────────────────────────

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
            { text: `Это фото товара. Извлеки точное название товара, бренд и объём/вес если видно. Ответь ТОЛЬКО валидным JSON: {"name":"полное название товара с объёмом","brand":"бренд или null","category":"food/drink/household/electronics/other или null","confidence":0.0}` },
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

// ─── Main: Tesseract → Gemini → manual ───────────────────────────────────────

export async function recognizeProduct(imageBuffer: Buffer): Promise<AiResult> {
  const result =
    (await recognizeWithTesseract(imageBuffer)) ??
    (await recognizeWithGemini(imageBuffer.toString("base64")));

  return result ?? { name: "", brand: null, category: null, confidence: 0, provider: "manual" };
}
