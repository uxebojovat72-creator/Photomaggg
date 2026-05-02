import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user: JwtPayload;
  }
}

export async function authenticate(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await req.jwtVerify();
  } catch {
    reply.code(401).send({ statusCode: 401, error: "Unauthorized", message: "Invalid or expired token" });
  }
}

export async function requireRole(
  roles: string[],
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!roles.includes(req.user.role)) {
    reply.code(403).send({ statusCode: 403, error: "Forbidden", message: "Insufficient permissions" });
  }
}

export function requireModerator(req: FastifyRequest, reply: FastifyReply) {
  return requireRole(["moderator", "admin"], req, reply);
}

export function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  return requireRole(["admin"], req, reply);
}

// Optional auth — attaches user if token present, but doesn't block
export async function optionalAuth(req: FastifyRequest): Promise<void> {
  try {
    await req.jwtVerify();
  } catch {
    // Not authenticated — continue as guest
  }
}

// Refresh token verification (separate secret)
export async function verifyRefreshToken(token: string): Promise<string | null> {
  const record = await prisma.refreshToken.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!record) return null;
  if (record.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { token } });
    return null;
  }
  return record.userId;
}
