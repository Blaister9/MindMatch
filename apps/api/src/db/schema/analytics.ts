import { pgSchema } from "drizzle-orm/pg-core";

/**
 * Esquema `analytics`: tablas/vistas agregadas para la página de Analítica
 * y (a futuro) Power BI. Sin datos identificables de mensajes.
 */
export const analytics = pgSchema("analytics");

// TODO(sección 3): definir aquí las tablas/vistas agregadas.
//   Ejemplos esperados: adoption_funnel, mood_rollups, alert_stats,
//   match_stats.
