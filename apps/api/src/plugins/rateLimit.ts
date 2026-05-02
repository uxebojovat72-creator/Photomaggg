import fp from "fastify-plugin";
import fastifyRateLimit from "@fastify/rate-limit";
import { redis } from "../lib/redis.js";
import { env } from "../lib/env.js";

export default fp(async (fastify) => {
  await fastify.register(fastifyRateLimit, {
    global: true,
    max: env.RATE_LIMIT_GUEST,
    timeWindow: "1 minute",
    redis,
    keyGenerator: (req) => {
      // Use user ID for authenticated requests (higher limit applied per-route)
      return (req.user as { id?: string } | undefined)?.id ?? req.ip;
    },
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)}s`,
    }),
  });
});
