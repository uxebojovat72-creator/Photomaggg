import fp from "fastify-plugin";
import fastifyCors from "@fastify/cors";
import { env } from "../lib/env.js";

export default fp(async (fastify) => {
  await fastify.register(fastifyCors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
});
