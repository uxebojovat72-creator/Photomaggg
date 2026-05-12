import type { FastifyInstance } from "fastify";
import { recognizeProduct, recognizePriceTag, recognizeReceipt } from "../ai/recognize.js";
import { authenticate } from "../middleware/auth.js";

const ACCEPTED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 10 * 1024 * 1024;

// ─── Per-user rate limiter: 30 AI requests / hour ────────────────────────────
const AI_LIMIT = 30;
const AI_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const aiUsage = new Map<string, { count: number; resetAt: number }>();

function checkAiRateLimit(userId: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  let entry = aiUsage.get(userId);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + AI_WINDOW_MS };
    aiUsage.set(userId, entry);
  }
  const remaining = Math.max(0, AI_LIMIT - entry.count);
  const resetIn = Math.ceil((entry.resetAt - now) / 1000);
  if (entry.count >= AI_LIMIT) return { allowed: false, remaining: 0, resetIn };
  entry.count++;
  return { allowed: true, remaining: remaining - 1, resetIn };
}

// Clean up stale entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of aiUsage) {
    if (now >= val.resetAt) aiUsage.delete(key);
  }
}, AI_WINDOW_MS);

export default async function aiRoutes(fastify: FastifyInstance) {
  // POST /ai/recognize — product label recognition
  fastify.post(
    "/recognize",
    { preHandler: authenticate },
    async (req, reply) => {
      const { allowed, remaining, resetIn } = checkAiRateLimit(req.user.sub);
      if (!allowed) {
        return reply.code(429).send({
          statusCode: 429, error: "Too Many Requests",
          message: `Лимит AI-запросов исчерпан. Повторите через ${Math.ceil(resetIn / 60)} мин.`,
        });
      }

      const data = await req.file();
      if (!data) return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: "Photo is required" });
      if (!ACCEPTED_MIME.has(data.mimetype)) return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: "Only JPEG, PNG, WebP accepted" });

      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of data.file) {
        size += (chunk as Buffer).length;
        if (size > MAX_SIZE) return reply.code(413).send({ statusCode: 413, error: "Payload Too Large", message: "Max 10 MB" });
        chunks.push(chunk as Buffer);
      }

      const result = await recognizeProduct(Buffer.concat(chunks));
      reply.header("X-AI-Remaining", remaining);
      return reply.send(result);
    }
  );

  // POST /ai/recognize-price — price tag recognition
  fastify.post(
    "/recognize-price",
    { preHandler: authenticate },
    async (req, reply) => {
      const { allowed, remaining, resetIn } = checkAiRateLimit(req.user.sub);
      if (!allowed) {
        return reply.code(429).send({
          statusCode: 429, error: "Too Many Requests",
          message: `Лимит AI-запросов исчерпан. Повторите через ${Math.ceil(resetIn / 60)} мин.`,
        });
      }

      const data = await req.file();
      if (!data) return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: "Photo is required" });
      if (!ACCEPTED_MIME.has(data.mimetype)) return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: "Only JPEG, PNG, WebP accepted" });

      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of data.file) {
        size += (chunk as Buffer).length;
        if (size > MAX_SIZE) return reply.code(413).send({ statusCode: 413, error: "Payload Too Large", message: "Max 10 MB" });
        chunks.push(chunk as Buffer);
      }

      const result = await recognizePriceTag(Buffer.concat(chunks));
      reply.header("X-AI-Remaining", remaining);
      return reply.send(result);
    }
  );

  // POST /ai/scan-receipt — full receipt recognition
  fastify.post(
    "/scan-receipt",
    { preHandler: authenticate },
    async (req, reply) => {
      // Receipt costs 3 units (reads many items at once)
      const userId = req.user.sub;
      const now = Date.now();
      let entry = aiUsage.get(userId);
      if (!entry || now >= entry.resetAt) { entry = { count: 0, resetAt: now + AI_WINDOW_MS }; aiUsage.set(userId, entry); }
      if (entry.count + 3 > AI_LIMIT) {
        const resetIn = Math.ceil((entry.resetAt - now) / 1000);
        return reply.code(429).send({
          statusCode: 429, error: "Too Many Requests",
          message: `Лимит AI-запросов исчерпан. Повторите через ${Math.ceil(resetIn / 60)} мин.`,
        });
      }
      entry.count += 3;

      const data = await req.file();
      if (!data) return reply.code(400).send({ message: "Photo is required" });
      if (!ACCEPTED_MIME.has(data.mimetype)) return reply.code(400).send({ message: "Only JPEG, PNG, WebP accepted" });

      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of data.file) {
        size += (chunk as Buffer).length;
        if (size > MAX_SIZE) return reply.code(413).send({ message: "Max 10 MB" });
        chunks.push(chunk as Buffer);
      }

      const result = await recognizeReceipt(Buffer.concat(chunks));
      return reply.send(result);
    }
  );
}
