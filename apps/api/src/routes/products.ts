import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  searchProducts,
  getSearchSuggestions,
  getProductById,
  getProductWithPrices,
  createProduct,
  getCategories,
  getPriceHistory,
} from "../services/product.service.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { lookupBarcodeExternal } from "../services/barcode.service.js";
import { lookupStorePrice } from "../services/store-price.service.js";

const createProductSchema = z.object({
  name: z.string().min(2).max(200),
  brand: z.string().max(100).optional(),
  barcode: z.string().regex(/^\d{8,14}$/).optional(),
  categoryId: z.string().uuid().optional(),
  aliases: z.array(z.string()).optional(),
});

export default async function productRoutes(fastify: FastifyInstance) {
  // GET /products/search?q=&category=&limit=&page=
  fastify.get<{
    Querystring: { q?: string; category?: string; limit?: string; page?: string };
  }>("/search", async (req, reply) => {
    const { q, category, limit, page } = req.query;
    const result = await searchProducts({
      q,
      category,
      limit: limit ? parseInt(limit, 10) : 20,
      page: page ? parseInt(page, 10) : 1,
    });
    return reply.send(result);
  });

  // GET /products/suggestions?q=
  fastify.get<{ Querystring: { q?: string } }>(
    "/suggestions",
    async (req, reply) => {
      const q = req.query.q ?? "";
      const suggestions = await getSearchSuggestions(q);
      return reply.send(suggestions);
    }
  );

  // GET /products/categories
  fastify.get("/categories", async (_req, reply) => {
    const categories = await getCategories();
    return reply.send(categories);
  });

  /**
   * GET /products/barcode/:code?storeName=
   *
   * 1. Local DB
   * 2. All external sources in parallel (OpenFoodFacts, OpenBeautyFacts,
   *    OpenPetFoodFacts, UPCitemdb) — returns the richest result
   * 3. If ?storeName= is provided, also runs a store-price lookup and
   *    includes storePrice in the response.
   */
  fastify.get<{
    Params: { code: string };
    Querystring: { storeName?: string };
  }>(
    "/barcode/:code",
    async (req, reply) => {
      const { code } = req.params;
      const { storeName } = req.query;

      if (!/^\d{8,14}$/.test(code)) {
        return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: "Invalid barcode" });
      }

      // 1. Check local DB
      const local = await prisma.product.findFirst({ where: { barcode: code } });

      if (local) {
        const base = { source: "local" as const, product: local };
        if (!storeName) return reply.send(base);
        const storePrice = await lookupStorePrice({ storeName, barcode: code, productName: local.name });
        return reply.send({ ...base, storePrice });
      }

      // 2. Query all external sources in parallel
      const external = await lookupBarcodeExternal(code);

      if (!external) {
        return reply.code(404).send({ statusCode: 404, error: "Not Found", message: "Штрихкод не найден ни в одной базе данных" });
      }

      const base = { source: external.source, product: external };
      if (!storeName) return reply.send(base);

      const storePrice = await lookupStorePrice({
        storeName,
        barcode: code,
        productName: external.name,
      });
      return reply.send({ ...base, storePrice });
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: optionalAuth },
    async (req, reply) => {
      const product = await getProductWithPrices(req.params.id);
      return reply.send(product);
    }
  );

  // GET /products/:id/prices?days=30&storeId=
  fastify.get<{
    Params: { id: string };
    Querystring: { days?: string; storeId?: string };
  }>("/:id/prices", async (req, reply) => {
    const days = req.query.days ? parseInt(req.query.days, 10) : 30;
    const history = await getPriceHistory(req.params.id, {
      days: days as 7 | 30 | 90,
      storeId: req.query.storeId,
    });
    return reply.send(history);
  });

  // POST /products — moderators and above
  fastify.post(
    "/",
    { preHandler: authenticate },
    async (req, reply) => {
      const body = createProductSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: body.error.issues[0].message });
      }

      const allowed = ["moderator", "admin", "trusted"];
      if (!allowed.includes(req.user.role)) {
        return reply.code(403).send({ statusCode: 403, error: "Forbidden", message: "Only trusted users can create products" });
      }

      const product = await createProduct({ ...body.data, createdBy: req.user.sub });
      return reply.code(201).send(product);
    }
  );

  // GET /products/check-duplicate?name=&barcode= — Level 3: UI duplicate check
  fastify.get<{ Querystring: { name?: string; barcode?: string } }>(
    "/check-duplicate",
    async (req, reply) => {
      const { name, barcode } = req.query;

      // Level 1: barcode match (definitive)
      if (barcode) {
        const byBarcode = await prisma.product.findFirst({
          where: { barcode, deletedAt: null },
          select: { id: true, name: true, brand: true, imageUrl: true, barcode: true },
        });
        if (byBarcode) {
          return reply.send({ exact: byBarcode, similar: [], matchType: "barcode" });
        }
      }

      if (!name || name.trim().length < 2) {
        return reply.send({ exact: null, similar: [], matchType: null });
      }

      // Level 2a: exact name match
      const exact = await prisma.product.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, deletedAt: null },
        select: { id: true, name: true, brand: true, imageUrl: true, barcode: true },
      });
      if (exact) {
        return reply.send({ exact, similar: [], matchType: "exact" });
      }

      // Level 2c: fuzzy match via pg_trgm — return candidates for UI selection
      try {
        type FuzzyRow = { id: string; name: string; brand: string | null; image_url: string | null; barcode: string | null; sim: number };
        const similar = await prisma.$queryRaw<FuzzyRow[]>`
          SELECT id, name, brand, image_url, barcode, similarity(name, ${name}) AS sim
          FROM products
          WHERE similarity(name, ${name}) > 0.35
            AND deleted_at IS NULL
          ORDER BY sim DESC
          LIMIT 5
        `;
        return reply.send({
          exact: null,
          similar: similar.map((r) => ({
            id: r.id, name: r.name, brand: r.brand,
            imageUrl: r.image_url, barcode: r.barcode,
            similarity: Math.round(r.sim * 100),
          })),
          matchType: similar.length > 0 ? "fuzzy" : null,
        });
      } catch {
        return reply.send({ exact: null, similar: [], matchType: null });
      }
    }
  );
}
