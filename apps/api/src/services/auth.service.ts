import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { signAccessToken, createRefreshToken } from "./token.service.js";
import type { RegisterRequest, LoginRequest, AuthResponse } from "@priceradar/shared";

const BCRYPT_ROUNDS = 12;

export async function register(data: RegisterRequest): Promise<AuthResponse> {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw Object.assign(new Error("Email already registered"), { statusCode: 409 });
  }

  let countryId: string | undefined;
  if (data.countryCode) {
    const country = await prisma.country.findUnique({ where: { code: data.countryCode } });
    countryId = country?.id;
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      displayName: data.displayName,
      countryId: countryId ?? null,
    },
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  await createRefreshToken(user.id);

  return {
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      trustScore: user.trustScore,
      countryId: user.countryId,
      cityId: user.cityId,
      createdAt: user.createdAt.toISOString(),
    },
  };
}

export async function login(data: LoginRequest): Promise<AuthResponse & { refreshToken: string }> {
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user || user.deletedAt) {
    throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
  }

  const valid = await bcrypt.compare(data.password, user.passwordHash);
  if (!valid) {
    throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const refreshToken = await createRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      trustScore: user.trustScore,
      countryId: user.countryId,
      cityId: user.cityId,
      createdAt: user.createdAt.toISOString(),
    },
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    include: { country: true, city: true },
  });
  if (!user) {
    throw Object.assign(new Error("User not found"), { statusCode: 404 });
  }
  return user;
}

export async function updateTrustScore(userId: string, delta: number): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { trustScore: { increment: delta } },
  });
  // Auto-promote to trusted when score >= 80
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user && user.trustScore >= 80 && user.role === "user") {
    await prisma.user.update({ where: { id: userId }, data: { role: "trusted" } });
  }
}
