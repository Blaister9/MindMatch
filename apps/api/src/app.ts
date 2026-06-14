import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { authRoutes } from "./routes/auth";
import { conversationRoutes } from "./routes/conversations";
import { discoveryRoutes } from "./routes/discovery";
import { doctorMatchRoutes } from "./routes/doctor-matches";
import { doctorReportRoutes } from "./routes/doctor-reports";
import { invitationRoutes } from "./routes/invitations";
import { patientRoutes } from "./routes/patient";
import { pulseRoutes } from "./routes/pulse";
import { reportRoutes } from "./routes/reports";
import { attachRealtime } from "./realtime/io";
import { env, frontendOrigins } from "./env";

export interface BuildAppOptions {
  /** Adjunta Socket.io al servidor HTTP. true en runtime real y tests realtime. */
  enableRealtime?: boolean;
  /** Solo tests: reduce la expiracion de typing sin cambiar runtime. */
  typingExpiryMs?: number;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger:
      env.NODE_ENV === "production"
        ? {
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "req.cookies",
                "req.body.body",
                "req.body.details",
                "req.body.password",
                "req.body.passwordConfirmation",
                "req.body.token",
                "req.body.refreshToken",
                "password",
                "passwordConfirmation",
                "token",
                "refreshToken",
                "tokenHash",
                "passwordHash",
              ],
              censor: "[REDACTED]",
            },
          }
        : {
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "req.cookies",
                "req.body.body",
                "req.body.details",
                "req.body.password",
                "req.body.passwordConfirmation",
                "req.body.token",
                "req.body.refreshToken",
                "password",
                "passwordConfirmation",
                "token",
                "refreshToken",
                "tokenHash",
                "passwordHash",
              ],
              censor: "[REDACTED]",
            },
            transport: {
              target: "pino-pretty",
              options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
            },
          },
  });

  app.register(cors, {
    origin(origin, callback) {
      if (!origin || frontendOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origen no permitido"), false);
    },
    credentials: true,
  });

  app.register(cookie);
  app.register(rateLimit, {
    global: false,
  });

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

  app.register(authRoutes);
  app.register(invitationRoutes);
  app.register(patientRoutes);
  app.register(discoveryRoutes);
  app.register(doctorMatchRoutes);
  app.register(conversationRoutes);
  app.register(reportRoutes);
  app.register(doctorReportRoutes);
  app.register(pulseRoutes);

  if (options.enableRealtime) {
    attachRealtime(app, { typingExpiryMs: options.typingExpiryMs });
  }

  return app;
}
