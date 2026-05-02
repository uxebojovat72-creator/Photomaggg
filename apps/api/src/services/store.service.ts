import { prisma } from "../lib/prisma.js";
import { buildPaginationMeta } from "@priceradar/shared";

export async function searchStores(params: {
  q?: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  limit?: number;
}) {
  const { q, city, country, limit = 20 } = params;

  const stores = await prisma.store.findMany({
    where: {
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(city
        ? { city: { name: { contains: city, mode: "insensitive" } } }
        : {}),
      ...(country
        ? { city: { country: { code: country.toUpperCase() } } }
        : {}),
    },
    include: { city: { include: { country: true } } },
    orderBy: { name: "asc" },
    take: limit,
  });

  return stores;
}

export async function getStoreById(id: string) {
  const store = await prisma.store.findUnique({
    where: { id },
    include: { city: { include: { country: true } } },
  });
  if (!store) throw Object.assign(new Error("Store not found"), { statusCode: 404 });
  return store;
}

export async function createStore(data: {
  name: string;
  chainName?: string;
  cityId: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  createdBy: string;
}) {
  // Check city exists
  const city = await prisma.city.findUnique({
    where: { id: data.cityId },
    include: { country: true },
  });
  if (!city) throw Object.assign(new Error("City not found"), { statusCode: 404 });

  return prisma.store.create({
    data: {
      name: data.name,
      chainName: data.chainName ?? null,
      cityId: data.cityId,
      countryId: city.countryId,
      address: data.address ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      createdBy: data.createdBy,
    },
    include: { city: { include: { country: true } } },
  });
}

export async function getStoresOnMap(params: {
  productId?: string;
  countryCode?: string;
}) {
  const { productId, countryCode } = params;

  const pricesWhere = productId
    ? { productId, status: "approved" as const, deletedAt: null }
    : { status: "approved" as const, deletedAt: null };

  const prices = await prisma.price.findMany({
    where: pricesWhere,
    include: {
      store: {
        include: { city: { include: { country: true } } },
      },
      product: { select: { id: true, name: true } },
    },
    orderBy: { price: "asc" },
    take: 500,
  });

  return prices
    .filter((p) => p.store.latitude && p.store.longitude)
    .filter((p) =>
      countryCode ? p.store.city.country.code === countryCode.toUpperCase() : true
    )
    .map((p) => ({
      storeId: p.storeId,
      storeName: p.store.name,
      lat: Number(p.store.latitude),
      lng: Number(p.store.longitude),
      price: Number(p.price),
      priceUsd: Number(p.priceUsd ?? 0),
      currencyCode: p.currencyCode,
      cityName: p.store.city.name,
      countryCode: p.store.city.country.code,
      productId: p.productId,
      productName: p.product.name,
    }));
}
