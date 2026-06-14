import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";
import { frontendOrigins } from "../env";
import { socketAuthMiddleware } from "./auth";
import type { AppIoServer } from "./events";
import { clearAllExpiryTimers, registerSocketHandlers } from "./handlers";
import { typingRegistry } from "./typing";

/**
 * Adjunta Socket.io al servidor HTTP real de Fastify. Una sola instancia por
 * instancia Fastify (guarda `hasDecorator`). Cierre limpio vía hook `onClose`,
 * que limpia timers y cierra los sockets antes de completar el shutdown.
 */
export function attachRealtime(app: FastifyInstance): void {
  if (app.hasDecorator("io")) return;

  const io: AppIoServer = new Server(app.server, {
    path: "/socket.io",
    serveClient: false,
    cors: { origin: frontendOrigins, credentials: true },
  });

  io.use(socketAuthMiddleware(app));
  io.on("connection", (socket) => registerSocketHandlers(io, socket));

  app.decorate("io", io);

  app.addHook("onClose", async () => {
    typingRegistry.clearAll();
    clearAllExpiryTimers();
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
  });
}
