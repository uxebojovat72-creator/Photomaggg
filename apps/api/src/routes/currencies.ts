import type { FastifyInstance } from "fastify";
import { getRates, fetchAndStore } from "../services/currency.service.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

export default async function currencyRoutes(fastify: FastifyInstance) {
  // GET /currencies/rates
  fastify.get("/rates", async (_req, reply) => {
    const rates = await getRates();
    return reply.send(rates);
  });

  // POST /currencies/refresh — admin only, force refresh
  fastify.post(
    "/refresh",
    { preHandler: [authenticate, requireAdmin] },
    async (_req, reply) => {
      const rates = await fetchAndStore();
      return reply.send(rates);
    }
  );
}
