import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import authRoutes from "./auth.js";

// Integration tests require DATABASE_URL — skip in unit mode
const isUnit = !process.env.DATABASE_URL?.includes("test");

describe.skipIf(isUnit)("Auth Routes", () => {
  const fastify = Fastify({ logger: false });

  beforeAll(async () => {
    await fastify.register(fastifyCookie);
    await fastify.register(fastifyJwt, { secret: "test_secret_min_32_chars_here_xx" });
    await fastify.register(authRoutes, { prefix: "/auth" });
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  it("registers a new user", async () => {
    const res = await fastify.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: `test_${Date.now()}@example.com`,
        password: "Password123!",
        displayName: "Test User",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("accessToken");
    expect(body.user.role).toBe("user");
  });

  it("rejects weak password", async () => {
    const res = await fastify.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "weak@example.com", password: "123", displayName: "Weak" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid email", async () => {
    const res = await fastify.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "not-an-email", password: "Password123!", displayName: "Bad" },
    });
    expect(res.statusCode).toBe(400);
  });
});
