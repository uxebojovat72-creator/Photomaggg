import type { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

export default async function favoritesRoutes(fastify: FastifyInstance) {
  // GET /favorites — list user's favorites
  fastify.get("/", { preHandler: authenticate }, async (req, reply) => {
    const userId = req.user.sub;
    const favorites = await prisma.favorite.findMany({
      where: { userId },
      include: {
        product: {
          include: {
            category: true,
            prices: {
              where: { status: "approved", deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                store: { include: { city: { include: { country: true } } } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return reply.send(favorites);
  });

  // POST /favorites — add to favorites
  fastify.post<{ Body: { productId: string; priceAlertThreshold?: number } }>(
    "/",
    { preHandler: authenticate },
    async (req, reply) => {
      const userId = req.user.sub;
      const { productId, priceAlertThreshold } = req.body;

      if (!productId) {
        return reply.code(400).send({ message: "productId is required" });
      }

      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) {
        return reply.code(404).send({ message: "Товар не найден" });
      }

      const favorite = await prisma.favorite.upsert({
        where: { userId_productId: { userId, productId } },
        create: {
          userId,
          productId,
          priceAlertThreshold: priceAlertThreshold ?? null,
        },
        update: {
          priceAlertThreshold: priceAlertThreshold ?? null,
        },
      });

      return reply.code(201).send(favorite);
    }
  );

  // DELETE /favorites/:productId — remove from favorites
  fastify.delete<{ Params: { productId: string } }>(
    "/:productId",
    { preHandler: authenticate },
    async (req, reply) => {
      const userId = req.user.sub;
      const { productId } = req.params;

      await prisma.favorite.deleteMany({
        where: { userId, productId },
      });

      return reply.code(204).send();
    }
  );

  // GET /favorites/check/:productId — check if product is favorited
  fastify.get<{ Params: { productId: string } }>(
    "/check/:productId",
    { preHandler: authenticate },
    async (req, reply) => {
      const userId = req.user.sub;
      const { productId } = req.params;

      const fav = await prisma.favorite.findUnique({
        where: { userId_productId: { userId, productId } },
      });

      return reply.send({ isFavorite: !!fav });
    }
  );
}
