import { env } from "../../env";
import type { MatchingService } from "../types";
import { DemoMatchingService } from "./demo";
import { PgVectorMatchingService } from "./pgvector";

const demo = new DemoMatchingService();
const pgvector = new PgVectorMatchingService();

/** Selección explícita por configuración (MATCHING_PROVIDER), no por lógica dispersa. */
export function getMatchingService(): MatchingService {
  return env.MATCHING_PROVIDER === "pgvector" ? pgvector : demo;
}

export { DemoMatchingService, PgVectorMatchingService };
