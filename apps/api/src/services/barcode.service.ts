/**
 * Multi-source barcode lookup with AI name cleanup.
 *
 * All external sources fire in parallel:
 *   • 5ka.ru          — Russian store, live prices (priority if found)
 *   • barcode-list.ru — Russian barcode directory, HTML scrape
 *   • Перекрёсток     — Russian store
 *   • Магнит          — Russian store
 *   • ВкусВилл        — Russian store
 *   • OpenFoodFacts   — global food DB
 *   • OpenBeautyFacts — cosmetics
 *   • OpenPetFoodFacts— pet food
 *   • UPCitemdb       — Western barcodes
 *
 * After picking the best result: if the name looks garbled and the product
 * image is available, Groq Vision reads the label and returns the correct name.
 */

import { env } from "../lib/env.js";

export interface BarcodeProduct {
  name: string;
  brand: string | null;
  barcode: string;
  imageUrl: string | null;
  quantity: string | null;
  description: string | null;
  categoryHint: string | null;
  price?: number | null;
  pricePromo?: number | null;
  storeSource?: string | null;
  source:
    | "local"
    | "5ka"
    | "perekrestok"
    | "magnit"
    | "vkusvill"
    | "barcodelist"
    | "openfoodfacts"
    | "openbeautyfacts"
    | "openpetfoodfacts"
    | "upcitemdb";
}

const UA = "PriceRadar/1.0 (github.com/priceradar)";
const MOB_UA =
  "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const OFF_FIELDS =
  "product_name_ru,product_name,brands,quantity,image_front_url,image_url,ingredients_text_ru,ingredients_text,categories_tags";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True when a name appears to be OCR garbage or machine-generated noise */
function isGarbledName(name: string): boolean {
  if (!name || name.length < 2) return true;
  const words = name.trim().split(/\s+/);
  // Average word length < 4 with 3+ words → fragments
  const avgLen = words.reduce((s, w) => s + w.length, 0) / words.length;
  if (words.length >= 3 && avgLen < 4) return true;
  // Known OCR artifacts on Russian food labels
  if (/смотк|листа|моток|рулон|отрез/i.test(name) && words.length <= 4) return true;
  // Consecutive consonants without vowels (impossible in real Russian/English)
  if (/[бвгджзйклмнпрстфхцчшщbcdfghjklmnpqrstvwxz]{5,}/i.test(name)) return true;
  return false;
}

/** Download product image and ask Groq Vision to read the real label */
async function cleanNameWithGroq(
  imageUrl: string,
  fallback: string
): Promise<{ name: string; brand: string | null }> {
  if (!env.GROQ_API_KEY) return { name: fallback, brand: null };
  try {
    const imgRes = await fetch(imageUrl, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!imgRes.ok) return { name: fallback, brand: null };

    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    const base64 = imgBuf.toString("base64");
    const mime =
      imgRes.headers.get("content-type")?.startsWith("image/")
        ? imgRes.headers.get("content-type")!
        : "image/jpeg";

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
              { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
              {
                type: "text",
                text: 'Прочитай точное название этого товара с упаковки. Включи бренд, тип продукта и объём/вес если видно. Ответь ТОЛЬКО JSON без пояснений: {"name":"полное название","brand":"бренд или null"}',
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 120,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return { name: fallback, brand: null };
    type R = { choices?: Array<{ message?: { content?: string } }> };
    const data = (await res.json()) as R;
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return { name: fallback, brand: null };

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { name: fallback, brand: null };

    type P = { name?: string; brand?: string | null };
    const parsed = JSON.parse(match[0]) as P;
    if (!parsed.name || parsed.name.trim().length < 3) return { name: fallback, brand: null };

    console.log(`[Barcode AI] "${fallback}" → "${parsed.name}"`);
    return { name: parsed.name.trim(), brand: parsed.brand ?? null };
  } catch {
    return { name: fallback, brand: null };
  }
}

// ─── 5ka.ru ───────────────────────────────────────────────────────────────────

async function try5ka(code: string): Promise<BarcodeProduct | null> {
  try {
    const res = await fetch(
      `https://5ka.ru/api/v2/search/products/?query=${encodeURIComponent(code)}&records_per_page=5`,
      {
        headers: { "User-Agent": MOB_UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    type Item = {
      id: number;
      name: string;
      plu?: string;
      photo?: string;
      prices: { price_reg__min: number; price_promo__min: number | null };
    };
    const data = (await res.json()) as { count: number; results: Item[] };
    const item = data.results?.find((r) => r.plu === code) ?? data.results?.[0];
    if (!item?.name) return null;
    return {
      name: item.name,
      brand: null,
      barcode: code,
      imageUrl: item.photo ?? null,
      quantity: null,
      description: null,
      categoryHint: null,
      price: item.prices.price_reg__min,
      pricePromo: item.prices.price_promo__min ?? null,
      storeSource: "Пятёрочка",
      source: "5ka",
    };
  } catch {
    return null;
  }
}

// ─── Перекрёсток ─────────────────────────────────────────────────────────────

async function tryPerekrestok(code: string): Promise<BarcodeProduct | null> {
  try {
    const res = await fetch(
      `https://www.perekrestok.ru/api/catalog/product/search?query=${encodeURIComponent(code)}&take=5`,
      {
        headers: { "User-Agent": MOB_UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    type Item = {
      plu: number;
      title: string;
      images?: Array<{ url?: string }>;
      prices: { regular: number; promo?: number };
      brand?: { title?: string };
      weight?: string;
    };
    type R = { content?: { items?: Item[] } };
    const data = (await res.json()) as R;
    const item = data.content?.items?.[0];
    if (!item?.title) return null;
    return {
      name: item.title,
      brand: item.brand?.title ?? null,
      barcode: code,
      imageUrl: item.images?.[0]?.url ?? null,
      quantity: item.weight ?? null,
      description: null,
      categoryHint: null,
      price: item.prices.regular / 100,
      pricePromo: item.prices.promo ? item.prices.promo / 100 : null,
      storeSource: "Перекрёсток",
      source: "perekrestok",
    };
  } catch {
    return null;
  }
}

// ─── Магнит ───────────────────────────────────────────────────────────────────

async function tryMagnit(code: string): Promise<BarcodeProduct | null> {
  try {
    // Magnit catalog search API
    const res = await fetch(
      `https://magnit.ru/api/v1/product/search?q=${encodeURIComponent(code)}&limit=5`,
      {
        headers: { "User-Agent": MOB_UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    type Item = { id: string; name: string; image?: string; price: number; old_price?: number; brand?: string };
    const data = (await res.json()) as { items?: Item[] };
    const item = data.items?.[0];
    if (!item?.name) return null;
    return {
      name: item.name,
      brand: item.brand ?? null,
      barcode: code,
      imageUrl: item.image ?? null,
      quantity: null,
      description: null,
      categoryHint: null,
      price: item.old_price ?? item.price,
      pricePromo: item.old_price ? item.price : null,
      storeSource: "Магнит",
      source: "magnit",
    };
  } catch {
    return null;
  }
}

// ─── ВкусВилл ─────────────────────────────────────────────────────────────────

async function tryVkusvill(code: string): Promise<BarcodeProduct | null> {
  try {
    const res = await fetch(
      `https://vkusvill.ru/api/smart/items.json?text=${encodeURIComponent(code)}&count=5`,
      {
        headers: {
          "User-Agent": MOB_UA,
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    type Item = { id: number; title: string; price: number; old_price?: number; link: string; image?: string };
    const data = (await res.json()) as { items?: Item[] };
    const item = data.items?.[0];
    if (!item?.title) return null;
    return {
      name: item.title,
      brand: null,
      barcode: code,
      imageUrl: item.image ?? null,
      quantity: null,
      description: null,
      categoryHint: null,
      price: item.old_price ?? item.price,
      pricePromo: item.old_price ? item.price : null,
      storeSource: "ВкусВилл",
      source: "vkusvill",
    };
  } catch {
    return null;
  }
}

// ─── barcode-list.ru (HTML scrape) ────────────────────────────────────────────

async function tryBarcodeList(code: string): Promise<BarcodeProduct | null> {
  try {
    const url = `https://barcode-list.ru/barcode/RU/%D0%9F%D0%BE%D0%B8%D1%81%D0%BA/${encodeURIComponent(code)}/page/1/`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": MOB_UA,
        Accept: "text/html",
        "Accept-Language": "ru-RU,ru;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Table row: <td>barcode</td><td>product name</td>
    const rowRe = new RegExp(
      `<td[^>]*>\\s*${code}\\s*</td>\\s*<td[^>]*>([^<]{3,120})</td>`,
      "i"
    );
    const m = html.match(rowRe);
    if (!m) return null;

    const name = m[1].trim();
    if (!name) return null;

    return {
      name,
      brand: null,
      barcode: code,
      imageUrl: null,
      quantity: null,
      description: null,
      categoryHint: null,
      source: "barcodelist",
    };
  } catch {
    return null;
  }
}

// ─── OpenFoodFacts ────────────────────────────────────────────────────────────

async function tryOpenFoodFacts(code: string): Promise<BarcodeProduct | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}&lc=ru`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    type R = {
      status: number;
      product?: {
        product_name_ru?: string;
        product_name?: string;
        brands?: string;
        quantity?: string;
        image_front_url?: string;
        image_url?: string;
        ingredients_text_ru?: string;
        ingredients_text?: string;
        categories_tags?: string[];
      };
    };
    const data = (await res.json()) as R;
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    const name = p.product_name_ru || p.product_name || "";
    if (!name) return null;
    const rawIng = p.ingredients_text_ru || p.ingredients_text || "";
    return {
      name: name.trim(),
      brand: p.brands?.split(",")[0].trim() ?? null,
      barcode: code,
      imageUrl: p.image_front_url ?? p.image_url ?? null,
      quantity: p.quantity ?? null,
      description: rawIng ? rawIng.replace(/_/g, "").substring(0, 300) : null,
      categoryHint: p.categories_tags?.[0]?.replace(/^en:|^ru:/, "") ?? null,
      source: "openfoodfacts",
    };
  } catch {
    return null;
  }
}

// ─── OpenBeautyFacts ──────────────────────────────────────────────────────────

async function tryOpenBeautyFacts(code: string): Promise<BarcodeProduct | null> {
  try {
    const fields =
      "product_name_ru,product_name,brands,quantity,image_front_url,categories_tags,ingredients_text_ru,ingredients_text";
    const res = await fetch(
      `https://world.openbeautyfacts.org/api/v2/product/${code}.json?fields=${fields}&lc=ru`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    type R = {
      status: number;
      product?: {
        product_name_ru?: string;
        product_name?: string;
        brands?: string;
        quantity?: string;
        image_front_url?: string;
        ingredients_text_ru?: string;
        ingredients_text?: string;
        categories_tags?: string[];
      };
    };
    const data = (await res.json()) as R;
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    const name = p.product_name_ru || p.product_name || "";
    if (!name) return null;
    const rawIng = p.ingredients_text_ru || p.ingredients_text || "";
    return {
      name: name.trim(),
      brand: p.brands?.split(",")[0].trim() ?? null,
      barcode: code,
      imageUrl: p.image_front_url ?? null,
      quantity: p.quantity ?? null,
      description: rawIng ? rawIng.replace(/_/g, "").substring(0, 300) : null,
      categoryHint: p.categories_tags?.[0]?.replace(/^en:|^ru:/, "") ?? null,
      source: "openbeautyfacts",
    };
  } catch {
    return null;
  }
}

// ─── OpenPetFoodFacts ─────────────────────────────────────────────────────────

async function tryOpenPetFoodFacts(code: string): Promise<BarcodeProduct | null> {
  try {
    const fields = "product_name,brands,quantity,image_front_url,categories_tags,ingredients_text";
    const res = await fetch(
      `https://world.openpetfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    type R = {
      status: number;
      product?: {
        product_name?: string;
        brands?: string;
        quantity?: string;
        image_front_url?: string;
        categories_tags?: string[];
        ingredients_text?: string;
      };
    };
    const data = (await res.json()) as R;
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    const name = p.product_name || "";
    if (!name) return null;
    return {
      name: name.trim(),
      brand: p.brands?.split(",")[0].trim() ?? null,
      barcode: code,
      imageUrl: p.image_front_url ?? null,
      quantity: p.quantity ?? null,
      description: p.ingredients_text ? p.ingredients_text.substring(0, 300) : null,
      categoryHint: p.categories_tags?.[0]?.replace(/^en:/, "") ?? null,
      source: "openpetfoodfacts",
    };
  } catch {
    return null;
  }
}

// ─── UPCitemdb ────────────────────────────────────────────────────────────────

async function tryUPCitemdb(code: string): Promise<BarcodeProduct | null> {
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`,
      {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    type Item = {
      title?: string;
      brand?: string;
      description?: string;
      images?: string[];
      category?: string;
      weight?: string;
    };
    type R = { code: string; total: number; items?: Item[] };
    const data = (await res.json()) as R;
    const item = data.items?.[0];
    if (!item?.title) return null;
    return {
      name: item.title.trim(),
      brand: item.brand?.trim() ?? null,
      barcode: code,
      imageUrl: item.images?.[0] ?? null,
      quantity: item.weight ?? null,
      description: item.description?.substring(0, 300) ?? null,
      categoryHint: item.category ?? null,
      source: "upcitemdb",
    };
  } catch {
    return null;
  }
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function score(r: BarcodeProduct): number {
  return (
    (r.imageUrl ? 4 : 0) +
    (r.price != null ? 3 : 0) +
    (r.brand ? 2 : 0) +
    (r.description ? 2 : 0) +
    (r.quantity ? 1 : 0)
  );
}

function bestResult(results: (BarcodeProduct | null)[]): BarcodeProduct | null {
  const valid = results.filter((r): r is BarcodeProduct => r !== null);
  if (valid.length === 0) return null;
  return valid.reduce((best, cur) => (score(cur) > score(best) ? cur : best));
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Query all external barcode sources in parallel and return the best result.
 * Russian store APIs (5ka, Перекрёсток, Магнит, ВкусВилл) take priority because
 * they have proper Russian product names and live prices.
 * If the best result still has a garbled name and an image URL, Groq Vision
 * reads the label from the photo and returns the correct name.
 */
export async function lookupBarcodeExternal(code: string): Promise<BarcodeProduct | null> {
  const [fiveKa, perek, magnit, vkusvill, barcodeList, off, beauty, pet, upc] =
    await Promise.all([
      try5ka(code),
      tryPerekrestok(code),
      tryMagnit(code),
      tryVkusvill(code),
      tryBarcodeList(code),
      tryOpenFoodFacts(code),
      tryOpenBeautyFacts(code),
      tryOpenPetFoodFacts(code),
      tryUPCitemdb(code),
    ]);

  // Russian store results — pick the best among those that responded
  const ruStore = bestResult([fiveKa, perek, magnit, vkusvill]);

  if (ruStore) {
    // If OFF/etc have an image that the store result lacks, merge it in
    if (!ruStore.imageUrl) {
      const fallback = bestResult([off, beauty, pet, upc, barcodeList]);
      if (fallback?.imageUrl) ruStore.imageUrl = fallback.imageUrl;
    }
    return ruStore;
  }

  // barcode-list.ru has reliable Russian names even without prices/images
  if (barcodeList) {
    const withImage = bestResult([off, beauty, pet, upc]);
    if (withImage?.imageUrl) {
      return {
        ...barcodeList,
        imageUrl: withImage.imageUrl,
        brand: withImage.brand ?? barcodeList.brand,
        quantity: withImage.quantity ?? barcodeList.quantity,
        description: withImage.description ?? barcodeList.description,
      };
    }
    return barcodeList;
  }

  // Fallback: global databases (OFF, beauty, pet, UPC)
  const result = bestResult([off, beauty, pet, upc]);
  if (!result) return null;

  // AI name cleanup — if the name looks like OCR garbage and we have an image
  if (isGarbledName(result.name) && result.imageUrl) {
    const { name: cleanName, brand: aiBrand } = await cleanNameWithGroq(
      result.imageUrl,
      result.name
    );
    return {
      ...result,
      name: cleanName,
      brand: result.brand ?? aiBrand,
    };
  }

  return result;
}
