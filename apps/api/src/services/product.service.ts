import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { buildPaginationMeta } from "@priceradar/shared";

const SUGGESTIONS_TTL = 300; // 5 min

export async function searchProducts(params: {
  q?: string;
  category?: string;
  page?: number;
  limit?: number;
}) {
  const { q, category, page = 1, limit = 20 } = params;
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    ...(category ? { category: { name: { contains: category, mode: "insensitive" as const } } } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return { data, meta: buildPaginationMeta(total, page, limit) };
}

export async function getSearchSuggestions(q: string): Promise<string[]> {
  if (q.length < 3) return [];

  const cacheKey = `suggest:${q.toLowerCase()}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as string[];

  const products = await prisma.product.findMany({
    where: { name: { contains: q, mode: "insensitive" }, deletedAt: null },
    select: { name: true },
    take: 10,
    orderBy: { name: "asc" },
  });

  const suggestions = products.map((p) => p.name);
  await redis.setex(cacheKey, SUGGESTIONS_TTL, JSON.stringify(suggestions));
  return suggestions;
}

export async function getProductById(id: string) {
  const product = await prisma.product.findUnique({
    where: { id, deletedAt: null },
    include: { category: true },
  });
  if (!product) throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  return product;
}

export async function getProductWithPrices(id: string) {
  const product = await prisma.product.findUnique({
    where: { id, deletedAt: null },
    include: {
      category: true,
      prices: {
        where: { status: "approved", deletedAt: null },
        include: {
          store: { include: { city: { include: { country: true } } } },
          user: { select: { id: true, displayName: true, avatarUrl: true, trustScore: true } },
        },
        orderBy: { price: "asc" },
        take: 50,
      },
    },
  });
  if (!product) throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  return product;
}

export async function createProduct(data: {
  name: string;
  brand?: string;
  barcode?: string;
  categoryId?: string;
  aliases?: string[];
  createdBy: string;
  aiGenerated?: boolean;
}) {
  // Check barcode uniqueness
  if (data.barcode) {
    const existing = await prisma.product.findUnique({ where: { barcode: data.barcode } });
    if (existing) return existing;
  }

  return prisma.product.create({
    data: {
      name: data.name,
      brand: data.brand ?? null,
      barcode: data.barcode ?? null,
      categoryId: data.categoryId ?? null,
      aliases: data.aliases ?? [],
      createdBy: data.createdBy,
      aiGenerated: data.aiGenerated ?? false,
    },
    include: { category: true },
  });
}

export async function getCategories() {
  return prisma.category.findMany({
    where: { parentId: null },
    include: { children: true },
    orderBy: { name: "asc" },
  });
}

export async function getPriceHistory(
  productId: string,
  options: { storeId?: string; days?: number }
) {
  const { storeId, days = 30 } = options;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const prices = await prisma.price.findMany({
    where: {
      productId,
      status: "approved",
      deletedAt: null,
      createdAt: { gte: since },
      ...(storeId ? { storeId } : {}),
    },
    include: {
      store: { include: { city: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const points = prices.map((p) => ({
    date: p.createdAt.toISOString(),
    price: Number(p.price),
    priceUsd: Number(p.priceUsd ?? 0),
    currencyCode: p.currencyCode,
    storeId: p.storeId,
    storeName: p.store.name,
  }));

  // Stats
  const usdPrices = prices.filter((p) => p.priceUsd).map((p) => Number(p.priceUsd));
  const stats = usdPrices.length
    ? {
        minPriceUsd: Math.min(...usdPrices),
        maxPriceUsd: Math.max(...usdPrices),
        avgPriceUsd: usdPrices.reduce((a, b) => a + b, 0) / usdPrices.length,
        priceCount: usdPrices.length,
      }
    : null;

  return { productId, points, stats };
}
