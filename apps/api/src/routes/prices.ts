import type { FastifyInstance } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { z } from "zod";
import {
  createPrice,
  getPriceFeed,
  getPriceById,
  updatePrice,
  deletePrice,
  reportPrice,
  getModerationQueue,
  moderatePrice,
} from "../services/price.service.js";
import { lookupStorePrice } from "../services/store-price.service.js";
import { authenticate, optionalAuth, requireModerator } from "../middleware/auth.js";

const createPriceSchema = z.object({
  // Product: either existing UUID or new name
  productId: z.string().uuid().optional(),
  productName: z.string().min(2).max(200).optional(),
  // Store: either existing UUID or new store details
  storeId: z.string().uuid().optional(),
  storeName: z.string().min(2).max(100).optional(),
  cityName: z.string().min(1).max(100).optional(),
  countryCode: z.string().length(2).toUpperCase().optional(),
  // Required
  price: z.coerce.number().positive().max(1_000_000),
  currencyCode: z.string().length(3).toUpperCase(),
  aiRecognizedName: z.string().optional(),
}).refine(
  (d) => d.productId || d.productName,
  { message: "Either productId or productName is required" }
).refine(
  (d) => d.storeId || d.storeName,
  { message: "Either storeId or storeName is required" }
);

const ACCEPTED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export default async function priceRoutes(fastify: FastifyInstance) {
  // GET /prices/store-lookup?storeName=&barcode=&productName=
  fastify.get<{
    Querystring: { storeName: string; barcode?: string; productName?: string };
  }>("/store-lookup", async (req, reply) => {
    const { storeName, barcode, productName } = req.query;
    if (!storeName) {
      return reply.code(400).send({ message: "storeName is required" });
    }
    const result = await lookupStorePrice({ storeName, barcode, productName });
    return reply.send(result);
  });

  // GET /prices/feed
  fastify.get<{
    Querystring: {
      country?: string; city?: string; category?: string;
      page?: string; limit?: string;
    };
  }>("/feed", { preHandler: optionalAuth }, async (req, reply) => {
    const { country, city, category, page, limit } = req.query;
    const result = await getPriceFeed({
      country,
      city,
      category,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    return reply.send(result);
  });

  // POST /prices — multipart: photo(optional) + JSON fields
  fastify.post("/", { preHandler: authenticate }, async (req, reply) => {
    const parts = req.parts();
    const fields: Record<string, string> = {};
    let photoBuffer: Buffer | undefined;
    let photoMime: string | undefined;

    for await (const part of parts) {
      if (part.type === "file") {
        if (!ACCEPTED_MIME.has(part.mimetype)) {
          return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: "Only JPEG, PNG, WebP images accepted" });
        }
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk as Buffer);
        }
        photoBuffer = Buffer.concat(chunks);
        photoMime = part.mimetype;
      } else {
        fields[part.fieldname] = (part as { value: string }).value;
      }
    }

    const parsed = createPriceSchema.safeParse(fields);
    if (!parsed.success) {
      return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: parsed.error.issues[0].message });
    }

    const price = await createPrice({
      productId: parsed.data.productId,
      productName: parsed.data.productName,
      storeId: parsed.data.storeId,
      storeName: parsed.data.storeName,
      cityName: parsed.data.cityName,
      countryCode: parsed.data.countryCode,
      price: parsed.data.price,
      currencyCode: parsed.data.currencyCode,
      aiRecognizedName: parsed.data.aiRecognizedName,
      userId: req.user.sub,
      userRole: req.user.role,
      userTrustScore: 0,
      photoBuffer,
      photoMime,
    });

    return reply.code(201).send(price);
  });

  // GET /prices/:id
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    async (req, reply) => {
      const price = await getPriceById(req.params.id);
      return reply.send(price);
    }
  );

  // PATCH /prices/:id
  fastify.patch<{
    Params: { id: string };
    Body: { price?: number; currencyCode?: string; storeId?: string };
  }>("/:id", { preHandler: authenticate }, async (req, reply) => {
    const updated = await updatePrice(req.params.id, req.user.sub, req.body);
    return reply.send(updated);
  });

  // DELETE /prices/:id
  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: authenticate },
    async (req, reply) => {
      await deletePrice(req.params.id, req.user.sub, req.user.role);
      return reply.send({ success: true });
    }
  );

  // POST /prices/:id/report
  fastify.post<{
    Params: { id: string };
    Body: { reason: string };
  }>("/:id/report", { preHandler: authenticate }, async (req, reply) => {
    const body = z.object({ reason: z.string().min(5).max(500) }).safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: body.error.issues[0].message });
    }
    const report = await reportPrice({
      priceId: req.params.id,
      reporterId: req.user.sub,
      reason: body.data.reason,
    });
    return reply.code(201).send(report);
  });

  // ─── Moderation ───────────────────────────────────────────────────────────────────────────

  // GET /prices/moderation/queue
  fastify.get<{ Querystring: { page?: string; limit?: string } }>(
    "/moderation/queue",
    { preHandler: [authenticate, requireModerator] },
    async (req, reply) => {
      const result = await getModerationQueue({
        page: req.query.page ? parseInt(req.query.page, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit, 10) : 20,
      });
      return reply.send(result);
    }
  );

  // PATCH /prices/moderation/:id
  fastify.patch<{
    Params: { id: string };
    Body: {
      action: "approve" | "reject";
      rejectReason?: string;
      editedProductName?: string;
    };
  }>(
    "/moderation/:id",
    { preHandler: [authenticate, requireModerator] },
    async (req, reply) => {
      const body = z
        .object({
          action: z.enum(["approve", "reject"]),
          rejectReason: z.string().max(500).optional(),
          editedProductName: z.string().max(200).optional(),
        })
        .safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: body.error.issues[0].message });
      }
      const updated = await moderatePrice(req.params.id, req.user.sub, body.data);
      return reply.send(updated);
    }
  );
}
