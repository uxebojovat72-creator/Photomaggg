import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export default async function geoRoutes(fastify: FastifyInstance) {
  // GET /geo/countries
  fastify.get("/countries", async (_req, reply) => {
    const countries = await prisma.country.findMany({
      orderBy: { name: "asc" },
    });
    return reply.send(countries);
  });

  // GET /geo/cities?country=RU&q=Moscow
  fastify.get<{ Querystring: { country?: string; q?: string } }>(
    "/cities",
    async (req, reply) => {
      const { country, q } = req.query;
      const cities = await prisma.city.findMany({
        where: {
          country: country ? { code: country } : undefined,
          name: q ? { contains: q, mode: "insensitive" } : undefined,
        },
        include: { country: true },
        orderBy: { name: "asc" },
        take: 20,
      });
      return reply.send(cities);
    }
  );
}
