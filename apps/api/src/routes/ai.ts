import type { FastifyInstance } from "fastify";
import { recognizeProduct, recognizePriceTag, recognizeReceipt } from "../ai/recognize.js";
import { authenticate } from "../middleware/auth.js";

const ACCEPTED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 10 * 1024 * 1024;

export default async function aiRoutes(fastify: FastifyInstance) {
  // POST /ai/recognize — accepts multipart with "photo" field
  fastify.post(
    "/recognize",
    { preHandler: authenticate },
    async (req, reply) => {
      const data = await req.file();
      if (!data) {
        return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: "Photo is required" });
      }

      if (!ACCEPTED_MIME.has(data.mimetype)) {
        return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: "Only JPEG, PNG, WebP accepted" });
      }

      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of data.file) {
        size += (chunk as Buffer).length;
        if (size > MAX_SIZE) {
          return reply.code(413).send({ statusCode: 413, error: "Payload Too Large", message: "Max 10 MB" });
        }
        chunks.push(chunk as Buffer);
      }

      const buffer = Buffer.concat(chunks);
      const result = await recognizeProduct(buffer);
      return reply.send(result);
    }
  );

  fastify.post(
    "/recognize-price",
    { preHandler: authenticate },
    async (req, reply) => {
      const data = await req.file();
      if (!data) {
        return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: "Photo is required" });
      }
      if (!ACCEPTED_MIME.has(data.mimetype)) {
        return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: "Only JPEG, PNG, WebP accepted" });
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of data.file) {
        size += (chunk as Buffer).length;
        if (size > MAX_SIZE) {
          return reply.code(413).send({ statusCode: 413, error: "Payload Too Large", message: "Max 10 MB" });
        }
        chunks.push(chunk as Buffer);
      }
      const buffer = Buffer.concat(chunks);
      const result = await recognizePriceTag(buffer);
      return reply.send(result);
    }
  );

  fastify.post(
    "/scan-receipt",
    { preHandler: authenticate },
    async (req, reply) => {
      const data = await req.file();
      if (!data) {
        return reply.code(400).send({ message: "Photo is required" });
      }
      if (!ACCEPTED_MIME.has(data.mimetype)) {
        return reply.code(400).send({ message: "Only JPEG, PNG, WebP accepted" });
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of data.file) {
        size += (chunk as Buffer).length;
        if (size > MAX_SIZE) {
          return reply.code(413).send({ message: "Max 10 MB" });
        }
        chunks.push(chunk as Buffer);
      }
      const buffer = Buffer.concat(chunks);
      const result = await recognizeReceipt(buffer);
      return reply.send(result);
    }
  );
}
