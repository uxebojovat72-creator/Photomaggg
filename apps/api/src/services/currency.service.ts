import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";

const CACHE_KEY = "currency:rates";
const CACHE_TTL_SEC = 3600; // 1 hour

export interface RatesMap {
  base: string;
  rates: Record<string, number>;
  updatedAt: string;
}

export async function getRates(): Promise<RatesMap> {
  // Try Redis cache first
  const cached = await redis.get(CACHE_KEY);
  if (cached) return JSON.parse(cached) as RatesMap;

  // Try DB
  const dbRecord = await prisma.currencyRate.findFirst({ orderBy: { updatedAt: "desc" } });
  if (dbRecord && Date.now() - dbRecord.updatedAt.getTime() < CACHE_TTL_SEC * 1000) {
    const result: RatesMap = {
      base: dbRecord.base,
      rates: dbRecord.rates as Record<string, number>,
      updatedAt: dbRecord.updatedAt.toISOString(),
    };
    await redis.setex(CACHE_KEY, CACHE_TTL_SEC, JSON.stringify(result));
    return result;
  }

  // Fetch fresh rates
  return fetchAndStore();
}

export async function fetchAndStore(): Promise<RatesMap> {
  try {
    const res = await fetch(env.EXCHANGE_RATE_API_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    type ApiResponse = { base: string; rates: Record<string, number>; date: string };
    const data = (await res.json()) as ApiResponse;
    if (!data.rates) throw new Error("Invalid response");

    const result: RatesMap = {
      base: "USD",
      rates: data.rates,
      updatedAt: new Date().toISOString(),
    };

    // Persist to DB
    await prisma.currencyRate.create({
      data: { base: "USD", rates: data.rates },
    });

    // Cache in Redis
    await redis.setex(CACHE_KEY, CACHE_TTL_SEC, JSON.stringify(result));
    return result;
  } catch (err) {
    // Return last known rates from DB if fetch fails
    const fallback = await prisma.currencyRate.findFirst({ orderBy: { updatedAt: "desc" } });
    if (fallback) {
      return {
        base: fallback.base,
        rates: fallback.rates as Record<string, number>,
        updatedAt: fallback.updatedAt.toISOString(),
      };
    }
    throw err;
  }
}

export async function convertToUsd(
  amount: number,
  currency: string
): Promise<number | null> {
  if (currency === "USD") return amount;
  try {
    const { rates } = await getRates();
    const rate = rates[currency];
    if (!rate) return null;
    return amount / rate;
  } catch {
    return null;
  }
}
