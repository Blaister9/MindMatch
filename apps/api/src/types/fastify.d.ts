import type { AuthContext } from "../auth/context";
import type { AppIoServer } from "../realtime/events";

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
  interface FastifyInstance {
    io?: AppIoServer;
  }
}
