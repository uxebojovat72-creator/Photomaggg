import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { register, login, getMe } from "../services/auth.service.js";
import {
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  signAccessToken,
} from "../services/token.service.js";
import { authenticate, verifyRefreshToken } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2).max(50),
  countryCode: z.string().length(2).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /auth/register
  fastify.post("/register", async (req, reply) => {
    const body = registerSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: body.error.issues[0].message });
    }
    try {
      const result = await register(body.data);
      return reply.code(201).send(result);
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string };
      const code = e.statusCode ?? 500;
      const msg = e.message ?? "Registration failed";
      return reply.code(code).send({ statusCode: code, error: code === 409 ? "Conflict" : "Internal Server Error", message: msg });
    }
  });

  // POST /auth/login
  fastify.post("/login", async (req, reply) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: body.error.issues[0].message });
    }
    const result = await login(body.data);
    // Set refresh token in httpOnly cookie
    reply.setCookie("refresh_token", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/auth",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });
    return reply.send({ accessToken: result.accessToken, user: result.user });
  });

  // POST /auth/refresh
  fastify.post("/refresh", async (req, reply) => {
    const token = (req.cookies as Record<string, string>)?.refresh_token;
    if (!token) {
      return reply.code(401).send({ statusCode: 401, error: "Unauthorized", message: "No refresh token" });
    }
    const userId = await verifyRefreshToken(token);
    if (!userId) {
      return reply.code(401).send({ statusCode: 401, error: "Unauthorized", message: "Invalid or expired refresh token" });
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.code(401).send({ statusCode: 401, error: "Unauthorized", message: "User not found" });
    }
    const newRefreshToken = await rotateRefreshToken(token, userId);
    const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });

    reply.setCookie("refresh_token", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/auth",
      maxAge: 30 * 24 * 60 * 60,
    });
    return reply.send({ accessToken });
  });

  // POST /auth/logout
  fastify.post("/logout", { preHandler: authenticate }, async (req, reply) => {
    const token = (req.cookies as Record<string, string>)?.refresh_token;
    if (token) {
      await revokeRefreshToken(token);
    }
    reply.clearCookie("refresh_token", { path: "/auth" });
    return reply.send({ success: true });
  });

  // POST /auth/logout-all
  fastify.post("/logout-all", { preHandler: authenticate }, async (req, reply) => {
    await revokeAllUserTokens(req.user.sub);
    reply.clearCookie("refresh_token", { path: "/auth" });
    return reply.send({ success: true });
  });

  // GET /auth/me
  fastify.get("/me", { preHandler: authenticate }, async (req, reply) => {
    const user = await getMe(req.user.sub);
    return reply.send({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      trustScore: user.trustScore,
      countryId: user.countryId,
      cityId: user.cityId,
      country: user.country,
      city: user.city,
      createdAt: user.createdAt.toISOString(),
    });
  });
}
