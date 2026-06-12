import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

// Cliente de consultas (pool) para la app.
export const queryClient = postgres(env.DATABASE_URL, { max: 10 });

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;

export * as schema from "./schema";
