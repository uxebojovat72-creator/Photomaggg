/**
 * Multi-source barcode lookup.
 * Priority: local DB → OpenFoodFacts → OpenBeautyFacts → OpenPetFoodFacts → UPCitemdb
 * All external sources are queried in parallel after local DB miss.
 */

export interface BarcodeProduct {
  name: string;
  brand: string | null;
  barcode: string;
  imageUrl: string | null;
  quantity: string | null;
  description: string | null;
  categoryHint: string | null;
  /** Where the data came from */
  source: "local" | "openfoodfacts" | "openbeautyfacts" | "openpetfoodfacts" | "upcitemdb";
}

const OFF_FIELDS = "product_name_ru,product_name,brands,quantity,image_front_url,image_url,ingredients_text_ru,ingredients_text,categories_tags";
const UA = "PriceRadar/1.0 (github.com/priceradar)";

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
        product_name_ru?: string; product_name?: string; brands?: string;
        quantity?: string; image_front_url?: string; image_url?: string;
        ingredients_text_ru?: string; ingredients_text?: string; categories_tags?: string[];
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

async function tryOpenBeautyFacts(code: string): Promise<BarcodeProduct | null> {
  try {
    const fields = "product_name_ru,product_name,brands,quantity,image_front_url,categories_tags,ingredients_text_ru,ingredients_text";
    const res = await fetch(
      `https://world.openbeautyfacts.org/api/v2/product/${code}.json?fields=${fields}&lc=ru`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    type R = {
      status: number;
      product?: {
        product_name_ru?: string; product_name?: string; brands?: string;
        quantity?: string; image_front_url?: string;
        ingredients_text_ru?: string; ingredients_text?: string; categories_tags?: string[];
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
        product_name?: string; brands?: string; quantity?: string;
        image_front_url?: string; categories_tags?: string[]; ingredients_text?: string;
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

async function tryUPCitemdb(code: string): Promise<BarcodeProduct | null> {
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`,
      {
        headers: {
          "User-Agent": UA,
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    type Item = { title?: string; brand?: string; description?: string; images?: string[]; category?: string; weight?: string };
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

/** Pick the result with the most filled-in fields */
function bestResult(results: (BarcodeProduct | null)[]): BarcodeProduct | null {
  const valid = results.filter((r): r is BarcodeProduct => r !== null);
  if (valid.length === 0) return null;
  return valid.reduce((best, cur) => {
    const score = (r: BarcodeProduct) =>
      (r.imageUrl ? 3 : 0) + (r.description ? 2 : 0) + (r.brand ? 1 : 0) + (r.quantity ? 1 : 0);
    return score(cur) > score(best) ? cur : best;
  });
}

/**
 * Query all external barcode sources in parallel and return the richest result.
 */
export async function lookupBarcodeExternal(code: string): Promise<BarcodeProduct | null> {
  const [off, beauty, pet, upc] = await Promise.all([
    tryOpenFoodFacts(code),
    tryOpenBeautyFacts(code),
    tryOpenPetFoodFacts(code),
    tryUPCitemdb(code),
  ]);
  return bestResult([off, beauty, pet, upc]);
}
