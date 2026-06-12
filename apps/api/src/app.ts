import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import Fastify, { type FastifyInstance } from "fastify";
import { env } from "./env";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger:
      env.NODE_ENV === "production"
        ? true
        : {
            transport: {
              target: "pino-pretty",
              options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
            },
          },
  });

  // CORS: en demo permitimos los orígenes locales de los dos frontends.
  app.register(cors, {
    origin: env.NODE_ENV === "production" ? false : true,
    credentials: true,
  });

  app.register(cookie);

  // JWT de acceso. El refresh se manejará vía cookie httpOnly (Fase 1).
  app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "mindmatch-api",
    env: env.NODE_ENV,
    demoMode: env.DEMO_MODE,
    time: new Date().toISOString(),
  }));

  // TODO(Fase 1+): registrar aquí las rutas de auth, perfiles, matching,
  // chat, pulso y panel — cada una detrás de requireRole('doctor'|'patient').

  return app;
}
