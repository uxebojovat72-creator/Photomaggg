import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import tesseract from "node-tesseract-ocr";
import sharp from "sharp";
import { env } from "../lib/env.js";

// ─── Provider health tracker ──────────────────────────────────────────────────
// If a provider returns 429/403 (quota/rate-limit), it's skipped for BACKOFF_MS.
// After backoff it's retried automatically — no manual intervention needed.

type Provider = "groq" | "gemini";

const health: Record<Provider, { failedAt: number; failures: number }> = {
  groq: { failedAt: 0, failures: 0 },
  gemini: { failedAt: 0, failures: 0 },
};

const BACKOFF_MS = 10 * 60 * 1000; // 10 min cooldown after quota hit

function isAvailable(p: Provider): boolean {
  if (health[p].failures === 0) return true;
  if (Date.now() - health[p].failedAt > BACKOFF_MS) {
    health[p].failures = 0; // auto-recover after backoff
    return true;
  }
  return false;
}

function markFailed(p: Provider, httpStatus?: number): void {
  health[p].failedAt = Date.now();
  health[p].failures++;
  console.warn(`[AI] ${p} unavailable — HTTP ${httpStatus ?? "error"} (failures: ${health[p].failures}, retry in ${BACKOFF_MS / 60000}m)`);
}

function markOk(p: Provider): void {
  if (health[p].failures > 0) {
    console.log(`[AI] ${p} recovered ✓`);
    health[p].failures = 0;
  }
}

export function getProviderStatus(): Record<Provider, { available: boolean; failures: number; recoversIn?: number }> {
  const now = Date.now();
  return {
    groq: {
      available: isAvailable("groq"),
      failures: health.groq.failures,
      recoversIn: health.groq.failures > 0 ? Math.max(0, Math.ceil((health.groq.failedAt + BACKOFF_MS - now) / 1000)) : undefined,
    },
    gemini: {
      available: isAvailable("gemini"),
      failures: health.gemini.failures,
      recoversIn: health.gemini.failures > 0 ? Math.max(0, Math.ceil((health.gemini.failedAt + BACKOFF_MS - now) / 1000)) : undefined,
    },
  };
}

// ─── Unified image compression ────────────────────────────────────────────────

async function compressImage(buf: Buffer, maxPx = 896, quality = 88): Promise<Buffer> {
  try {
    return await sharp(buf)
      .resize(maxPx, maxPx, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
  } catch {
    return buf;
  }
}

// ─── Core API callers ─────────────────────────────────────────────────────────

async function callGroq(base64: string, prompt: string, maxTokens = 300): Promise<string | null> {
  if (!env.GROQ_API_KEY || !isAvailable("groq")) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
          { type: "text", text: prompt },
        ]}],
        temperature: 0.1,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      markFailed("groq", res.status);
      const body = await res.text().catch(() => "");
      console.error(`[Groq] HTTP ${res.status}:`, body.slice(0, 150));
      return null;
    }

    type R = { choices?: Array<{ message?: { content?: string } }> };
    const data = (await res.json()) as R;
    const text = data.choices?.[0]?.message?.content?.trim() ?? null;
    if (text) markOk("groq");
    return text;
  } catch (e) {
    if ((e as Error).name !== "AbortError") {
      console.error("[Groq] network error:", (e as Error).message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(base64: string, prompt: string, maxTokens = 300): Promise<string | null> {
  if (!env.GEMINI_API_KEY || !isAvailable("gemini")) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: base64 } },
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      markFailed("gemini", res.status);
      const body = await res.text().catch(() => "");
      console.error(`[Gemini] HTTP ${res.status}:`, body.slice(0, 150));
      return null;
    }

    type R = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const data = (await res.json()) as R;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
    if (text) markOk("gemini");
    return text;
  } catch (e) {
    if ((e as Error).name !== "AbortError") {
      console.error("[Gemini] network error:", (e as Error).message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Try Groq first, Gemini as fallback (or reversed if Groq is in backoff)
async function callBestProvider(
  base64: string,
  prompt: string,
  maxTokens = 300
): Promise<{ text: string; provider: Provider } | null> {
  const groqOk = isAvailable("groq") && !!env.GROQ_API_KEY;
  const geminiOk = isAvailable("gemini") && !!env.GEMINI_API_KEY;

  // Determine order: prefer Groq (7000 req/day), fallback Gemini (1500 req/day)
  const order: Provider[] = groqOk ? ["groq", "gemini"] : ["gemini", "groq"];

  for (const p of order) {
    const text = p === "groq"
      ? await callGroq(base64, prompt, maxTokens)
      : await callGemini(base64, prompt, maxTokens);
    if (text) {
      console.log(`[AI] ✓ ${p} handled request`);
      return { text, provider: p };
    }
  }

  // Both failed
  if (groqOk || geminiOk) {
    console.error("[AI] Both Groq and Gemini failed for this request");
  } else {
    console.warn("[AI] No vision API keys configured");
  }
  return null;
}

// ─── Parse JSON from LLM response ────────────────────────────────────────────

function parseJson<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiResult {
  name: string;
  brand: string | null;
  category: string | null;
  confidence: number;
  provider: "groq" | "gemini" | "tesseract" | "cloudflare" | "manual";
}

export interface ReceiptItem {
  name: string;
  brand: string | null;
  price: number;
}

// ─── Product recognition ──────────────────────────────────────────────────────

const PRODUCT_PROMPT =
  'Это фото товара или ценника. Определи название ТОЛЬКО если на фото ВИДНА этикетка, упаковка или надпись с названием. ' +
  'Если предмет без видимой этикетки или надписей — верни {"name":"","brand":null,"category":null,"confidence":0.0}. ' +
  'Ответь ТОЛЬКО JSON без пояснений: {"name":"точное название с объёмом/весом если видно","brand":"бренд или null","category":"food/drink/household/electronics/cosmetics/other или null","confidence":0.0}';

export async function recognizeProduct(imageBuffer: Buffer): Promise<AiResult> {
  const compressed = await compressImage(imageBuffer, 896);
  const base64 = compressed.toString("base64");

  const result = await callBestProvider(base64, PRODUCT_PROMPT, 200);

  if (result) {
    type P = { name?: string; brand?: string | null; category?: string | null; confidence?: number };
    const parsed = parseJson<P>(result.text);
    if (parsed && typeof parsed.name === "string" && parsed.name.trim()) {
      return {
        name: parsed.name.trim(),
        brand: parsed.brand ?? null,
        category: parsed.category ?? null,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.9,
        provider: result.provider,
      };
    }
  }

  // Tesseract fallback
  const ocr = await recognizeWithTesseract(imageBuffer);
  if (ocr) return ocr;

  return { name: "", brand: null, category: null, confidence: 0, provider: "manual" };
}

// ─── Price tag recognition ────────────────────────────────────────────────────

const PRICE_PROMPT =
  'Это фото ценника в магазине. Найди цену товара. ' +
  'Ответь ТОЛЬКО JSON: {"price": 99.99, "currency": "RUB"}. ' +
  'Если цена не видна — {"price": null, "currency": "RUB"}';

export async function recognizePriceTag(imageBuffer: Buffer): Promise<{ price: number | null; currency: string }> {
  const compressed = await compressImage(imageBuffer, 896);
  const base64 = compressed.toString("base64");

  const result = await callBestProvider(base64, PRICE_PROMPT, 100);

  if (result) {
    type P = { price?: number | null; currency?: string };
    const parsed = parseJson<P>(result.text);
    if (parsed && typeof parsed.price === "number" && parsed.price > 0) {
      console.log(`[${result.provider} Price]`, parsed.price);
      return { price: parsed.price, currency: parsed.currency ?? "RUB" };
    }
  }

  return { price: null, currency: "RUB" };
}

// ─── Receipt (чек) recognition ────────────────────────────────────────────────

const RECEIPT_PROMPT =
  "Это фото кассового чека. Извлеки список товаров с ЦЕНОЙ ЗА ЕДИНИЦУ (не итоговой суммой). " +
  "Правило: если строка содержит формулу ЦенаЗаЕд × Количество = Итог (напр. 229.90×3.688=847.87) — " +
  "бери ПЕРВОЕ число (229.90), это цена за кг/штуку. " +
  "Если штучный товар куплен в 1 шт — цена за штуку = итогу, бери её. " +
  "Если куплено N штук одного товара — дели итог на N и пиши цену за 1 штуку. " +
  "НЕ включай итоги покупки, скидки отдельной строкой, налоги, бонусы, сдачу. " +
  'Ответь ТОЛЬКО JSON: {"storeName":"название магазина или null","items":[{"name":"название товара","brand":"бренд или null","price":99.99}]}';

export async function recognizeReceipt(
  imageBuffer: Buffer
): Promise<{ items: ReceiptItem[]; storeName: string | null }> {
  // Receipts need higher resolution for small text
  const compressed = await compressImage(imageBuffer, 1400, 92);
  const base64 = compressed.toString("base64");

  const result = await callBestProvider(base64, RECEIPT_PROMPT, 3000);

  if (result) {
    type P = { storeName?: string | null; items?: Array<{ name?: string; brand?: string | null; price?: number }> };
    const parsed = parseJson<P>(result.text);
    if (parsed && Array.isArray(parsed.items)) {
      const items: ReceiptItem[] = parsed.items
        .filter((i) => i.name && typeof i.price === "number" && i.price > 0)
        .map((i) => ({ name: String(i.name!).trim(), brand: i.brand ?? null, price: Number(i.price) }));
      if (items.length > 0) {
        console.log(`[${result.provider} Receipt] ${items.length} items, store: ${parsed.storeName ?? "?"}`);
        return { items, storeName: parsed.storeName ?? null };
      }
    }
  }

  return { items: [], storeName: null };
}

// ─── Tesseract OCR (last resort for product labels) ───────────────────────────

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
        return l.split(/\s+/).some((w) => w.length >= 3);
      });

    if (lines.length === 0) return null;

    const scored = lines
      .map((l) => {
        const cyr = (l.match(/[а-яА-ЯёЁ]/g) ?? []).length;
        const lat = (l.match(/[a-zA-Z]/g) ?? []).length;
        return { line: l, score: l.length * ((cyr + lat) / l.length) * (cyr > 0 ? 1.3 : 1) };
      })
      .sort((a, b) => b.score - a.score);

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
