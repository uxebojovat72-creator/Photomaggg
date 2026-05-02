import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import { env } from "../lib/env.js";

export default fp(async (fastify) => {
  await fastify.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_EXPIRES_IN },
  });
});
