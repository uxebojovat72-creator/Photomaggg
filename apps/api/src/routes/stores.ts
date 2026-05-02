import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  searchStores,
  getStoreById,
  createStore,
  getStoresOnMap,
} from "../services/store.service.js";
import { authenticate } from "../middleware/auth.js";

const createStoreSchema = z.object({
  name: z.string().min(2).max(100),
  chainName: z.string().max(100).optional(),
  cityId: z.string().uuid(),
  address: z.string().max(500).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export default async function storeRoutes(fastify: FastifyInstance) {
  // GET /stores/search?q=&city=&country=&limit=
  fastify.get<{
    Querystring: { q?: string; city?: string; country?: string; limit?: string };
  }>("/search", async (req, reply) => {
    const { q, city, country, limit } = req.query;
    const stores = await searchStores({
      q,
      city,
      country,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    return reply.send(stores);
  });

  // GET /stores/map?productId=&countryCode=
  fastify.get<{ Querystring: { productId?: string; countryCode?: string } }>(
    "/map",
    async (req, reply) => {
      const points = await getStoresOnMap({
        productId: req.query.productId,
        countryCode: req.query.countryCode,
      });
      return reply.send(points);
    }
  );

  // GET /stores/:id
  fastify.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const store = await getStoreById(req.params.id);
    return reply.send(store);
  });

  // POST /stores
  fastify.post("/", { preHandler: authenticate }, async (req, reply) => {
    const body = createStoreSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: body.error.issues[0].message,
      });
    }
    const store = await createStore({ ...body.data, createdBy: req.user.sub });
    return reply.code(201).send(store);
  });
}
