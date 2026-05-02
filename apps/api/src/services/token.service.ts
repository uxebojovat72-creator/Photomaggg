import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 900;
  const [, num, unit] = match;
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return parseInt(num) * multipliers[unit];
}

export function signAccessToken(payload: { sub: string; email: string; role: string }): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export async function createRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(64).toString("hex");
  const expiresAt = new Date(
    Date.now() + parseDuration(env.JWT_REFRESH_EXPIRES_IN) * 1000
  );
  await prisma.refreshToken.create({ data: { userId, token, expiresAt } });
  return token;
}

export async function rotateRefreshToken(
  oldToken: string,
  userId: string
): Promise<string> {
  await prisma.refreshToken.deleteMany({ where: { token: oldToken } });
  return createRefreshToken(userId);
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token } });
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}
