import type { AuthContext } from "../auth/context";

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
