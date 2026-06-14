import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { analyticsRangeQuerySchema } from "@mindmatch/shared";
import { authenticate, requireAuthContext, requireRole } from "../auth/guards";
import { db, schema } from "../db";
import { parseQuery } from "../http/validation";
import { todayForClinic } from "../pulse/business-clock";
import { addDays } from "../pulse/dates";
import {
  getAlertsAggregation,
  getFunnel,
  getMatchingMetrics,
  getMoodSeries,
} from "../analytics/analytics-service";

const MOOD_DEFAULT_DAYS = 14;

export async function analyticsRoutes(app: FastifyInstance) {
  app.get(
    "/doctor/analytics/summary",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request) => {
      const auth = requireAuthContext(request);
      const today = await todayForClinic(db, auth.clinicId);
      const [snap] = await db
        .select({ d: sql<string | null>`max(${schema.clinicDailyMetrics.metricDate})` })
        .from(schema.clinicDailyMetrics)
        .where(eq(schema.clinicDailyMetrics.clinicId, auth.clinicId));
      const snapshotDate = snap?.d ?? null;
      return {
        today,
        generatedAt: new Date().toISOString(),
        dataStatus: snapshotDate ? ("ok" as const) : ("not_generated" as const),
        snapshotDate,
        isCurrentSnapshot: snapshotDate === today,
        matching: await getMatchingMetrics(db, auth.clinicId),
      };
    },
  );

  app.get(
    "/doctor/analytics/mood",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const query = parseQuery(analyticsRangeQuerySchema, request, reply);
      if (!query) return;
      const today = await todayForClinic(db, auth.clinicId);
      const to = query.to ?? today;
      const from = query.from ?? addDays(to, 1 - MOOD_DEFAULT_DAYS);
      return getMoodSeries(db, auth.clinicId, from, to);
    },
  );

  app.get(
    "/doctor/analytics/alerts",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const query = parseQuery(analyticsRangeQuerySchema, request, reply);
      if (!query) return;
      const today = await todayForClinic(db, auth.clinicId);
      const to = query.to ?? today;
      const from = query.from ?? addDays(to, 1 - 30);
      return getAlertsAggregation(db, auth.clinicId, from, to);
    },
  );

  app.get(
    "/doctor/analytics/funnel",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const query = parseQuery(analyticsRangeQuerySchema, request, reply);
      if (!query) return;
      const today = await todayForClinic(db, auth.clinicId);
      const to = query.to ?? today;
      const from = query.from ?? null;
      return getFunnel(db, auth.clinicId, to, from);
    },
  );
}
