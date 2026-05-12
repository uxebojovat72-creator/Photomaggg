import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import fastifyMultipart from "@fastify/multipart";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";

import corsPlugin from "./plugins/cors.js";
import jwtPlugin from "./plugins/jwt.js";
import rateLimitPlugin from "./plugins/rateLimit.js";

import authRoutes from "./routes/auth.js";
import geoRoutes from "./routes/geo.js";
import productRoutes from "./routes/products.js";
import priceRoutes from "./routes/prices.js";
import storeRoutes from "./routes/stores.js";
import aiRoutes from "./routes/ai.js";
import currencyRoutes from "./routes/currencies.js";
import favoritesRoutes from "./routes/favorites.js";

import { env } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";

const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "warn" : "info",
    transport:
      env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
});

// ─── Plugins ─────────────────────────────────────────────────────────────────

await fastify.register(fastifyHelmet, {
  contentSecurityPolicy: false, // Managed by Cloudflare
});

await fastify.register(fastifyCookie);
await fastify.register(corsPlugin);
await fastify.register(jwtPlugin);
await fastify.register(rateLimitPlugin);

await fastify.register(fastifyMultipart, {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ─── Swagger ──────────────────────────────────────────────────────────────────

await fastify.register(fastifySwagger, {
  openapi: {
    info: { title: "PriceRadar API", version: "1.0.0" },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
  },
});

await fastify.register(fastifySwaggerUi, {
  routePrefix: "/docs",
  uiConfig: { docExpansion: "list" },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

await fastify.register(authRoutes, { prefix: "/auth" });
await fastify.register(geoRoutes, { prefix: "/geo" });
await fastify.register(productRoutes, { prefix: "/products" });
await fastify.register(priceRoutes, { prefix: "/prices" });
await fastify.register(storeRoutes, { prefix: "/stores" });
await fastify.register(aiRoutes, { prefix: "/ai" });
await fastify.register(currencyRoutes, { prefix: "/currencies" });
await fastify.register(favoritesRoutes, { prefix: "/favorites" });

// Enable pg_trgm for fuzzy product search (idempotent)
try {
  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await prisma.$executeRawUnsafe(
    "CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON products USING GIN (name gin_trgm_ops)"
  );
} catch (e) {
  fastify.log.warn("pg_trgm setup skipped: " + (e instanceof Error ? e.message : e));
}

// Health check
fastify.get("/health", async () => ({
  status: "ok",
  timestamp: new Date().toISOString(),
  env: env.NODE_ENV,
}));

// ─── Error handler ───────────────────────────────────────────────────────────

fastify.setErrorHandler((error, _req, reply) => {
  const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
  fastify.log.error(error);
  reply.code(statusCode).send({
    statusCode,
    error: error.name ?? "Internal Server Error",
    message: error.message ?? "An unexpected error occurred",
  });
});

// ─── Graceful shutdown ───────────────────────────────────────────────────────

const shutdown = async () => {
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ─── Start ────────────────────────────────────────────────────────────────────

try {
  await fastify.listen({ port: env.PORT, host: env.HOST });
  console.log(`PriceRadar API running on http://${env.HOST}:${env.PORT}`);
  console.log(`API docs at http://${env.HOST}:${env.PORT}/docs`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
