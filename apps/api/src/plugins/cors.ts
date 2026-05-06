import fp from "fastify-plugin";
import fastifyCors from "@fastify/cors";
import { env } from "../lib/env.js";

export default fp(async (fastify) => {
  const origins = env.CORS_ORIGINS;
  const allowAll = origins.includes("*");

  await fastify.register(fastifyCors, {
    origin: allowAll ? true : (origin, callback) => {
      if (!origin) { callback(null, true); return; }
      if (origins.includes(origin) || origin.endsWith(".photomaggg.pages.dev")) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"), false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
});
