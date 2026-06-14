import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { CreateMissionInput, Mission } from "@mindmatch/shared";
import { db, schema } from "../db";
import { todayForClinic } from "../pulse/business-clock";

function toMissionDto(
  row: {
    id: string;
    title: string;
    description: string;
    dueDate: string | null;
    status: "assigned" | "completed" | "expired" | "cancelled";
    completedAt: Date | null;
    createdAt: Date;
  },
  today: string,
): Mission {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate,
    status: row.status,
    overdue: row.status === "assigned" && row.dueDate !== null && row.dueDate < today,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export type CreateMissionOutcome =
  | { kind: "created"; mission: Mission }
  | { kind: "patient_not_found" }
  | { kind: "invalid_due_date" };

export async function createMission(
  clinicId: string,
  doctorUserId: string,
  patientUserId: string,
  input: CreateMissionInput,
): Promise<CreateMissionOutcome> {
  const today = await todayForClinic(db, clinicId);
  const dueDate = input.dueDate ?? null;
  if (dueDate !== null && dueDate < today) {
    return { kind: "invalid_due_date" };
  }

  const [patient] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.clinicId, clinicId),
        eq(schema.users.id, patientUserId),
        eq(schema.users.role, "patient"),
      ),
    )
    .limit(1);
  if (!patient) return { kind: "patient_not_found" };

  const [row] = await db
    .insert(schema.wellnessMissions)
    .values({
      id: randomUUID(),
      clinicId,
      patientUserId,
      assignedByUserId: doctorUserId,
      title: input.title,
      description: input.description,
      dueDate,
      status: "assigned",
    })
    .returning();
  if (!row) throw new Error("Mission not created");
  return { kind: "created", mission: toMissionDto(row, today) };
}

export async function listMissionsForPatient(
  clinicId: string,
  patientUserId: string,
): Promise<Mission[]> {
  const today = await todayForClinic(db, clinicId);
  const rows = await db
    .select()
    .from(schema.wellnessMissions)
    .where(
      and(
        eq(schema.wellnessMissions.clinicId, clinicId),
        eq(schema.wellnessMissions.patientUserId, patientUserId),
      ),
    )
    .orderBy(desc(schema.wellnessMissions.createdAt));
  return rows.map((r) => toMissionDto(r, today));
}

export type MissionTransitionOutcome =
  | { kind: "ok"; status: "completed" | "cancelled" }
  | { kind: "not_found" }
  | { kind: "conflict" };

export async function completePatientMission(
  clinicId: string,
  patientUserId: string,
  missionId: string,
): Promise<MissionTransitionOutcome> {
  return db.transaction(async (tx) => {
    const [mission] = await tx
      .select({ status: schema.wellnessMissions.status })
      .from(schema.wellnessMissions)
      .where(
        and(
          eq(schema.wellnessMissions.clinicId, clinicId),
          eq(schema.wellnessMissions.id, missionId),
          eq(schema.wellnessMissions.patientUserId, patientUserId),
        ),
      )
      .for("update")
      .limit(1);
    if (!mission) return { kind: "not_found" };
    if (mission.status === "completed") return { kind: "ok", status: "completed" };
    if (mission.status !== "assigned") return { kind: "conflict" };
    await tx
      .update(schema.wellnessMissions)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.wellnessMissions.clinicId, clinicId),
          eq(schema.wellnessMissions.id, missionId),
          eq(schema.wellnessMissions.status, "assigned"),
        ),
      );
    return { kind: "ok", status: "completed" };
  });
}

export async function cancelDoctorMission(
  clinicId: string,
  missionId: string,
): Promise<MissionTransitionOutcome> {
  return db.transaction(async (tx) => {
    const [mission] = await tx
      .select({ status: schema.wellnessMissions.status })
      .from(schema.wellnessMissions)
      .where(
        and(
          eq(schema.wellnessMissions.clinicId, clinicId),
          eq(schema.wellnessMissions.id, missionId),
        ),
      )
      .for("update")
      .limit(1);
    if (!mission) return { kind: "not_found" };
    if (mission.status === "cancelled") return { kind: "ok", status: "cancelled" };
    if (mission.status !== "assigned") return { kind: "conflict" };
    await tx
      .update(schema.wellnessMissions)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(schema.wellnessMissions.clinicId, clinicId),
          eq(schema.wellnessMissions.id, missionId),
          eq(schema.wellnessMissions.status, "assigned"),
        ),
      );
    return { kind: "ok", status: "cancelled" };
  });
}
