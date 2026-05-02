import { prisma } from "../lib/prisma.js";
import { buildPaginationMeta } from "@priceradar/shared";
import { convertToUsd } from "./currency.service.js";
import { updateTrustScore } from "./auth.service.js";
import { uploadPhoto } from "./storage.service.js";
import { recognizeProduct } from "../ai/recognize.js";

const SPAM_LIMIT = 20;
const SPAM_WINDOW_MS = 60 * 60 * 1000; // 1 hour

async function checkSpam(userId: string): Promise<void> {
  const since = new Date(Date.now() - SPAM_WINDOW_MS);
  const count = await prisma.price.count({
    where: { userId, createdAt: { gte: since } },
  });
  if (count >= SPAM_LIMIT) {
    throw Object.assign(
      new Error(`Rate limit: max ${SPAM_LIMIT} prices per hour`),
      { statusCode: 429 }
    );
  }
}

export async function createPrice(data: {
  productId: string;
  storeId: string;
  userId: string;
  userRole: string;
  userTrustScore: number;
  price: number;
  currencyCode: string;
  photoBuffer?: Buffer;
  photoMime?: string;
  aiRecognizedName?: string;
}) {
  await checkSpam(data.userId);

  let photoUrl: string | null = null;
  if (data.photoBuffer && data.photoMime) {
    const uploaded = await uploadPhoto(
      data.photoBuffer,
      `${data.userId}-${data.productId}`,
      data.photoMime
    );
    photoUrl = uploaded.url;
  }

  const priceUsd = await convertToUsd(data.price, data.currencyCode);

  // Auto-approve for trusted/moderator/admin
  const autoApprove =
    data.userTrustScore >= 80 ||
    ["trusted", "moderator", "admin"].includes(data.userRole);

  const price = await prisma.price.create({
    data: {
      productId: data.productId,
      storeId: data.storeId,
      userId: data.userId,
      price: data.price,
      currencyCode: data.currencyCode,
      priceUsd: priceUsd ?? null,
      photoUrl,
      aiRecognizedName: data.aiRecognizedName ?? null,
      status: autoApprove ? "approved" : "pending",
    },
    include: {
      product: true,
      store: { include: { city: { include: { country: true } } } },
      user: { select: { id: true, displayName: true, avatarUrl: true, trustScore: true } },
    },
  });

  return price;
}

export async function getPriceFeed(params: {
  country?: string;
  city?: string;
  category?: string;
  page?: number;
  limit?: number;
}) {
  const { country, city, category, page = 1, limit = 20 } = params;
  const skip = (page - 1) * limit;

  const where = {
    status: "approved" as const,
    deletedAt: null,
    ...(country
      ? { store: { city: { country: { code: country.toUpperCase() } } } }
      : {}),
    ...(city
      ? { store: { city: { name: { contains: city, mode: "insensitive" as const } } } }
      : {}),
    ...(category
      ? { product: { category: { name: { contains: category, mode: "insensitive" as const } } } }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.price.findMany({
      where,
      include: {
        product: { include: { category: true } },
        store: { include: { city: { include: { country: true } } } },
        user: { select: { id: true, displayName: true, avatarUrl: true, trustScore: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.price.count({ where }),
  ]);

  return { data, meta: buildPaginationMeta(total, page, limit) };
}

export async function getPriceById(id: string) {
  const price = await prisma.price.findUnique({
    where: { id },
    include: {
      product: true,
      store: { include: { city: { include: { country: true } } } },
      user: { select: { id: true, displayName: true, avatarUrl: true, trustScore: true } },
    },
  });
  if (!price) throw Object.assign(new Error("Price not found"), { statusCode: 404 });
  return price;
}

export async function updatePrice(
  id: string,
  userId: string,
  data: { price?: number; currencyCode?: string; storeId?: string }
) {
  const existing = await prisma.price.findUnique({ where: { id } });
  if (!existing) throw Object.assign(new Error("Price not found"), { statusCode: 404 });
  if (existing.userId !== userId) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }

  let priceUsd = existing.priceUsd ? Number(existing.priceUsd) : null;
  if (data.price || data.currencyCode) {
    const newPrice = data.price ?? Number(existing.price);
    const newCurrency = data.currencyCode ?? existing.currencyCode;
    priceUsd = await convertToUsd(newPrice, newCurrency);
  }

  return prisma.price.update({
    where: { id },
    data: {
      ...(data.price ? { price: data.price } : {}),
      ...(data.currencyCode ? { currencyCode: data.currencyCode } : {}),
      ...(data.storeId ? { storeId: data.storeId } : {}),
      ...(priceUsd !== null ? { priceUsd } : {}),
      status: "pending", // Re-queue for moderation on edit
    },
  });
}

export async function deletePrice(id: string, userId: string, userRole: string) {
  const existing = await prisma.price.findUnique({ where: { id } });
  if (!existing) throw Object.assign(new Error("Price not found"), { statusCode: 404 });
  if (existing.userId !== userId && !["moderator", "admin"].includes(userRole)) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }
  await prisma.price.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function reportPrice(data: {
  priceId: string;
  reporterId: string;
  reason: string;
}) {
  const price = await prisma.price.findUnique({ where: { id: data.priceId } });
  if (!price) throw Object.assign(new Error("Price not found"), { statusCode: 404 });

  return prisma.priceReport.create({
    data: {
      priceId: data.priceId,
      reporterId: data.reporterId,
      reason: data.reason,
    },
  });
}

// ─── Moderation ───────────────────────────────────────────────────────────────

export async function getModerationQueue(params: { page?: number; limit?: number }) {
  const { page = 1, limit = 20 } = params;
  const skip = (page - 1) * limit;

  const where = { status: "pending" as const, deletedAt: null };

  const [data, total] = await Promise.all([
    prisma.price.findMany({
      where,
      include: {
        product: true,
        store: { include: { city: { include: { country: true } } } },
        user: { select: { id: true, displayName: true, trustScore: true } },
      },
      orderBy: { createdAt: "asc" },
      skip,
      take: limit,
    }),
    prisma.price.count({ where }),
  ]);

  return { data, meta: buildPaginationMeta(total, page, limit) };
}

export async function moderatePrice(
  priceId: string,
  moderatorId: string,
  decision: {
    action: "approve" | "reject";
    rejectReason?: string;
    editedProductName?: string;
  }
) {
  const price = await prisma.price.findUnique({
    where: { id: priceId },
    include: { product: true },
  });
  if (!price) throw Object.assign(new Error("Price not found"), { statusCode: 404 });

  const status = decision.action === "approve" ? "approved" : "rejected";

  if (decision.editedProductName && price.productId) {
    await prisma.product.update({
      where: { id: price.productId },
      data: { name: decision.editedProductName, aiConfirmed: true },
    });
  }

  const updated = await prisma.price.update({
    where: { id: priceId },
    data: {
      status,
      rejectReason: decision.rejectReason ?? null,
      moderatedBy: moderatorId,
      moderatedAt: new Date(),
    },
  });

  // Update trust score
  const delta = decision.action === "approve" ? 2 : -5;
  await updateTrustScore(price.userId, delta);

  return updated;
}
