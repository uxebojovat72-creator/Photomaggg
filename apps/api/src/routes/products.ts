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

  // GET /products/barcode/:code — lookup in DB first, then Open Food Facts
  fastify.get<{ Params: { code: string } }>(
    "/barcode/:code",
    async (req, reply) => {
      const { code } = req.params;
      if (!/^\d{8,14}$/.test(code)) {
        return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: "Invalid barcode" });
      }

      // 1. Check local DB first
      const local = await prisma.product.findFirst({ where: { barcode: code } });
      if (local) return reply.send({ source: "local", product: local });

      // 2. Query Open Food Facts (free, no key needed) — prefer Russian data
      try {
        const fields = "product_name_ru,product_name,brands,quantity,image_front_url,image_url,ingredients_text_ru,ingredients_text,categories_tags";
        const res = await fetch(
          `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}&lc=ru`,
          { headers: { "User-Agent": "PriceRadar/1.0 (github.com/priceradar)" }, signal: AbortSignal.timeout(9000) }
        );
        if (res.ok) {
          type OFFResponse = {
            status: number;
            product?: {
              product_name_ru?: string;
              product_name?: string;
              brands?: string;
              quantity?: string;
              image_front_url?: string;
              image_url?: string;
              ingredients_text_ru?: string;
              ingredients_text?: string;
              categories_tags?: string[];
            };
          };
          const data = (await res.json()) as OFFResponse;
          if (data.status === 1 && data.product) {
            const p = data.product;
            const name = p.product_name_ru || p.product_name || "";
            if (name) {
              const rawIngredients = p.ingredients_text_ru || p.ingredients_text || "";
              const description = rawIngredients.length > 0
                ? rawIngredients.replace(/_/g, "").substring(0, 300)
                : null;
              return reply.send({
                source: "openfoodfacts",
                product: {
                  name: name.trim(),
                  brand: p.brands?.split(",")[0].trim() ?? null,
                  barcode: code,
                  imageUrl: p.image_front_url ?? p.image_url ?? null,
                  quantity: p.quantity ?? null,
                  description,
                  categoryHint: p.categories_tags?.[0]?.replace(/^en:|^ru:/, "") ?? null,
                },
              });
            }
          }
        }
      } catch {
        // OFF unavailable — return not found
      }

      return reply.code(404).send({ statusCode: 404, error: "Not Found", message: "Product not found" });
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
}
