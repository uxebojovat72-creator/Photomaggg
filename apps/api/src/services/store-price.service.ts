export interface StorePriceResult {
  found: boolean;
  price?: number;
  pricePromo?: number;
  currency: string;
  productName?: string;
  storeDisplayName?: string;
  productUrl?: string;
  searchUrl: string;
}

type LookupFn = (query: string) => Promise<StorePriceResult>;

async function lookup5ka(query: string): Promise<StorePriceResult> {
  const searchUrl = `https://5ka.ru/catalog/search/?text=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(
      `https://5ka.ru/api/v2/search/products/?query=${encodeURIComponent(query)}&records_per_page=3`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(9000),
      }
    );
    if (!res.ok) return { found: false, currency: "RUB", searchUrl };
    type R = { count: number; results: Array<{ id: number; name: string; prices: { price_reg__min: number; price_promo__min: number | null } }> };
    const data = await res.json() as R;
    const item = data.results?.[0];
    if (!item) return { found: false, currency: "RUB", searchUrl };
    return {
      found: true,
      price: item.prices.price_reg__min,
      pricePromo: item.prices.price_promo__min ?? undefined,
      currency: "RUB",
      productName: item.name,
      storeDisplayName: "Пятёрочка",
      productUrl: `https://5ka.ru/product/${item.id}`,
      searchUrl,
    };
  } catch {
    return { found: false, currency: "RUB", searchUrl };
  }
}

async function lookupVkusvill(query: string): Promise<StorePriceResult> {
  const searchUrl = `https://vkusvill.ru/goods/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(
      `https://vkusvill.ru/api/smart/items.json?text=${encodeURIComponent(query)}&count=3`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        signal: AbortSignal.timeout(9000),
      }
    );
    if (!res.ok) return { found: false, currency: "RUB", searchUrl };
    type R = { items?: Array<{ id: number; title: string; price: number; old_price?: number; link: string }> };
    const data = await res.json() as R;
    const item = data.items?.[0];
    if (!item) return { found: false, currency: "RUB", searchUrl };
    return {
      found: true,
      price: item.old_price ?? item.price,
      pricePromo: item.old_price ? item.price : undefined,
      currency: "RUB",
      productName: item.title,
      storeDisplayName: "ВкусВилл",
      productUrl: `https://vkusvill.ru${item.link}`,
      searchUrl,
    };
  } catch {
    return { found: false, currency: "RUB", searchUrl };
  }
}

async function lookupPerekrestok(query: string): Promise<StorePriceResult> {
  const searchUrl = `https://www.perekrestok.ru/cat?search=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(
      `https://www.perekrestok.ru/api/catalog/product/search?query=${encodeURIComponent(query)}&take=3`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(9000),
      }
    );
    if (!res.ok) return { found: false, currency: "RUB", searchUrl };
    type R = { content?: { items?: Array<{ plu: number; title: string; prices: { regular: number; promo?: number } }> } };
    const data = await res.json() as R;
    const item = data.content?.items?.[0];
    if (!item) return { found: false, currency: "RUB", searchUrl };
    return {
      found: true,
      price: item.prices.regular / 100,
      pricePromo: item.prices.promo ? item.prices.promo / 100 : undefined,
      currency: "RUB",
      productName: item.title,
      storeDisplayName: "Перекрёсток",
      productUrl: `https://www.perekrestok.ru/product/${item.plu}`,
      searchUrl,
    };
  } catch {
    return { found: false, currency: "RUB", searchUrl };
  }
}

async function lookupMagnit(query: string): Promise<StorePriceResult> {
  const searchUrl = `https://magnit.ru/promo/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(
      `https://magnit.ru/api/v1/product/search?q=${encodeURIComponent(query)}&limit=3`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(9000),
      }
    );
    if (!res.ok) return { found: false, currency: "RUB", searchUrl };
    type R = { items?: Array<{ id: string; name: string; price: number; old_price?: number }> };
    const data = await res.json() as R;
    const item = data.items?.[0];
    if (!item) return { found: false, currency: "RUB", searchUrl };
    return {
      found: true,
      price: item.old_price ?? item.price,
      pricePromo: item.old_price ? item.price : undefined,
      currency: "RUB",
      productName: item.name,
      storeDisplayName: "Магнит",
      productUrl: `https://magnit.ru/product/${item.id}`,
      searchUrl,
    };
  } catch {
    return { found: false, currency: "RUB", searchUrl };
  }
}

async function lookupLenta(query: string): Promise<StorePriceResult> {
  const searchUrl = `https://lenta.com/search?query=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(
      `https://lenta.com/api/v1/search?query=${encodeURIComponent(query)}&pageSize=3`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(9000),
      }
    );
    if (!res.ok) return { found: false, currency: "RUB", searchUrl };
    type R = { skus?: Array<{ id: string; title: string; regularPrice: number; discountPrice?: number }> };
    const data = await res.json() as R;
    const item = data.skus?.[0];
    if (!item) return { found: false, currency: "RUB", searchUrl };
    return {
      found: true,
      price: item.regularPrice,
      pricePromo: item.discountPrice,
      currency: "RUB",
      productName: item.title,
      storeDisplayName: "Лента",
      productUrl: `https://lenta.com/product/${item.id}`,
      searchUrl,
    };
  } catch {
    return { found: false, currency: "RUB", searchUrl };
  }
}

const MATCHERS: Array<{ re: RegExp; fn: LookupFn }> = [
  { re: /пятерочк|пятёрочк|pyaterochka|5ka/i, fn: lookup5ka },
  { re: /вкусвилл|vkusvill/i, fn: lookupVkusvill },
  { re: /перекрест|perekrestok/i, fn: lookupPerekrestok },
  { re: /магнит|magnit/i, fn: lookupMagnit },
  { re: /лента|lenta/i, fn: lookupLenta },
];

export async function lookupStorePrice(opts: {
  storeName: string;
  barcode?: string | null;
  productName?: string;
}): Promise<StorePriceResult> {
  const { storeName, barcode, productName } = opts;
  const query = barcode ?? productName ?? storeName;
  const yandexUrl = `https://yandex.ru/search/?text=${encodeURIComponent(`${productName ?? barcode} ${storeName} цена`)}`;

  const match = MATCHERS.find(m => m.re.test(storeName));
  if (match) {
    const result = await match.fn(query);
    if (!result.found) result.searchUrl = yandexUrl;
    return result;
  }

  return { found: false, currency: "RUB", searchUrl: yandexUrl };
}
