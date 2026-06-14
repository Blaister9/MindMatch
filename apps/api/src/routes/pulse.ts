import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  manageAlertInputSchema,
  pulseHistoryQuerySchema,
  simulateDayInputSchema,
  updatePulsePreferencesInputSchema,
  upsertCheckInInputSchema,
} from "@mindmatch/shared";
import { authenticate, requireAuthContext, requireRole } from "../auth/guards";
import { db, schema } from "../db";
import { sendError } from "../http/errors";
import { parseBody, parseParams, parseQuery } from "../http/validation";
import { todayForClinic } from "../pulse/business-clock";
import { addDays } from "../pulse/dates";
import {
  ensurePulsePreference,
  getHistory,
  listDoctorAlerts,
  toCheckInDto,
  upsertPatientCheckIn,
} from "../pulse/pulse-service";
import { simulateDemoDay } from "../pulse/demo-simulation";

const alertParamsSchema = z.object({ alertId: z.string().uuid() });
const patientPulseParamsSchema = z.object({ patientUserId: z.string().uuid() });
const alertsQuerySchema = z.object({
  status: z.enum(["open", "managed", "all"]).default("open"),
});

export async function pulseRoutes(app: FastifyInstance) {
  app.get(
    "/patient/pulse/today",
    { preHandler: [authenticate, requireRole("patient")] },
    async (request) => {
      const auth = requireAuthContext(request);
      const today = await todayForClinic(db, auth.clinicId);
      const [checkIn] = await db
        .select()
        .from(schema.checkIns)
        .where(
          and(
            eq(schema.checkIns.clinicId, auth.clinicId),
            eq(schema.checkIns.patientUserId, auth.userId),
            eq(schema.checkIns.checkInDate, today),
          ),
        )
        .limit(1);
      const preference = await db.transaction((tx) =>
        ensurePulsePreference(tx, auth.clinicId, auth.userId, today),
      );
      return {
        today,
        completed: Boolean(checkIn),
        checkIn: checkIn ? toCheckInDto(checkIn) : null,
        preference: {
          enabled: preference.enabled,
          localTime: preference.localTime.slice(0, 5),
          timezone: preference.timezone,
        },
      };
    },
  );

  app.put(
    "/patient/pulse/today",
    { preHandler: [authenticate, requireRole("patient")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const body = parseBody(upsertCheckInInputSchema, request, reply);
      if (!body) return;
      const today = await todayForClinic(db, auth.clinicId);
      const checkIn = await upsertPatientCheckIn(auth.clinicId, auth.userId, today, body);
      return { checkIn };
    },
  );

  app.get(
    "/patient/pulse/history",
    { preHandler: [authenticate, requireRole("patient")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const query = parseQuery(pulseHistoryQuerySchema, request, reply);
      if (!query) return;
      const asOfDate = await todayForClinic(db, auth.clinicId);
      const days = query.days ?? 7;
      const points = await getHistory(db, auth.clinicId, auth.userId, asOfDate, days);
      return { asOfDate, days, points };
    },
  );

  app.get(
    "/patient/pulse/preferences",
    { preHandler: [authenticate, requireRole("patient")] },
    async (request) => {
      const auth = requireAuthContext(request);
      const today = await todayForClinic(db, auth.clinicId);
      const preference = await db.transaction((tx) =>
        ensurePulsePreference(tx, auth.clinicId, auth.userId, today),
      );
      return {
        enabled: preference.enabled,
        localTime: preference.localTime.slice(0, 5),
        timezone: preference.timezone,
      };
    },
  );

  app.put(
    "/patient/pulse/preferences",
    { preHandler: [authenticate, requireRole("patient")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const body = parseBody(updatePulsePreferencesInputSchema, request, reply);
      if (!body) return;
      const today = await todayForClinic(db, auth.clinicId);
      const preference = await db.transaction(async (tx) => {
        const current = await ensurePulsePreference(tx, auth.clinicId, auth.userId, today);
        const enabledOn = body.enabled
          ? current.enabled
            ? current.enabledOn
            : today
          : null;
        const [updated] = await tx
          .update(schema.checkInPreferences)
          .set({
            enabled: body.enabled,
            enabledOn,
            localTime: `${body.localTime}:00`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.checkInPreferences.clinicId, auth.clinicId),
              eq(schema.checkInPreferences.patientUserId, auth.userId),
            ),
          )
          .returning();
        if (!updated) throw new Error("Preference not updated");
        return updated;
      });
      return {
        enabled: preference.enabled,
        localTime: preference.localTime.slice(0, 5),
        timezone: preference.timezone,
      };
    },
  );

  app.get(
    "/doctor/alerts",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const query = parseQuery(alertsQuerySchema, request, reply);
      if (!query) return;
      return { alerts: await listDoctorAlerts(auth.clinicId, query.status) };
    },
  );

  app.get(
    "/doctor/alerts/:alertId",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const params = parseParams(alertParamsSchema, request, reply);
      if (!params) return;
      const alerts = await listDoctorAlerts(auth.clinicId, "all");
      const alert = alerts.find((item) => item.alertId === params.alertId);
      if (!alert) return sendError(reply, 404, "NOT_FOUND");
      return { alert };
    },
  );

  app.post(
    "/doctor/alerts/:alertId/manage",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const params = parseParams(alertParamsSchema, request, reply);
      const body = parseBody(manageAlertInputSchema, request, reply);
      if (!params || !body) return;
      const result = await db.transaction(async (tx) => {
        const [alert] = await tx
          .select()
          .from(schema.alerts)
          .where(and(eq(schema.alerts.clinicId, auth.clinicId), eq(schema.alerts.id, params.alertId)))
          .for("update")
          .limit(1);
        if (!alert) return "not_found" as const;
        if (alert.status === "dismissed") return "dismissed" as const;
        if (alert.status === "managed") {
          if (alert.ruleCode !== "R6") return "managed" as const;
          const reportId = alert.dedupeKey?.startsWith("R6:") ? alert.dedupeKey.slice(3) : null;
          if (!reportId) return "conflict" as const;
          const [report] = await tx
            .select({ status: schema.messageReports.status })
            .from(schema.messageReports)
            .where(and(eq(schema.messageReports.clinicId, auth.clinicId), eq(schema.messageReports.id, reportId)))
            .limit(1);
          return report && (report.status === "reviewed" || report.status === "actioned")
            ? ("managed" as const)
            : ("conflict" as const);
        }

        if (alert.ruleCode === "R6") {
          const inputReportId = String(alert.inputsJson.messageReportId ?? "");
          const reportId = alert.dedupeKey?.startsWith("R6:") ? alert.dedupeKey.slice(3) : "";
          if (!reportId || reportId !== inputReportId) return "conflict" as const;
          const [report] = await tx
            .select()
            .from(schema.messageReports)
            .where(and(eq(schema.messageReports.clinicId, auth.clinicId), eq(schema.messageReports.id, reportId)))
            .for("update")
            .limit(1);
          if (!report) return "conflict" as const;
          await tx
            .update(schema.messageReports)
            .set({ status: "reviewed", resolvedAt: new Date() })
            .where(and(eq(schema.messageReports.clinicId, auth.clinicId), eq(schema.messageReports.id, reportId)));
        }
        await tx
          .update(schema.alerts)
          .set({
            status: "managed",
            managedAt: new Date(),
            managedByUserId: auth.userId,
            managementNote: body.managementNote ?? null,
            updatedAt: new Date(),
          })
          .where(and(eq(schema.alerts.clinicId, auth.clinicId), eq(schema.alerts.id, params.alertId)));
        return "managed" as const;
      });
      if (result === "not_found") return sendError(reply, 404, "NOT_FOUND");
      if (result === "dismissed" || result === "conflict") return sendError(reply, 409, "CONFLICT");
      return { status: "managed" };
    },
  );

  app.get(
    "/doctor/patients/:patientUserId/pulse",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const params = parseParams(patientPulseParamsSchema, request, reply);
      const query = parseQuery(pulseHistoryQuerySchema, request, reply);
      if (!params || !query) return;
      const [patient] = await db
        .select({ id: schema.patientClinical.patientUserId })
        .from(schema.patientClinical)
        .where(
          and(
            eq(schema.patientClinical.clinicId, auth.clinicId),
            eq(schema.patientClinical.patientUserId, params.patientUserId),
          ),
        )
        .limit(1);
      if (!patient) return sendError(reply, 404, "NOT_FOUND");
      const asOfDate = await todayForClinic(db, auth.clinicId);
      const days = query.days ?? 7;
      return {
        asOfDate,
        days,
        points: await getHistory(db, auth.clinicId, params.patientUserId, asOfDate, days),
      };
    },
  );

  app.post(
    "/doctor/demo/simulate-day",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const body = parseBody(simulateDayInputSchema, request, reply);
      if (!body) return;
      const result = await simulateDemoDay(auth.clinicId, body.requestId);
      if ("rejected" in result) {
        return sendError(reply, result.rejected === "production" ? 403 : 404, result.rejected === "production" ? "FORBIDDEN" : "NOT_FOUND");
      }
      return result;
    },
  );
}
