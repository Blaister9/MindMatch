import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { ConnectionType, SwipeDecision } from "@mindmatch/shared";
import { db, schema } from "../db";
import {
  canonicalUuidPair,
  pairLockKey,
  resolveSuggestedType,
  sharedBilateralTypes,
} from "../domain/pairs";
import { validatePairForSwipe } from "./discovery-service";
import type { MatchingContext, MatchingService } from "./types";

export type SwipeOutcome =
  | { kind: "rejected"; reason: "self" | "not_discoverable" | "no_compatibility" | "no_type" | "no_score" }
  | { kind: "conflict"; persistedDecision: SwipeDecision }
  | { kind: "pass" }
  | { kind: "liked" }
  | { kind: "matched"; connectionStatus: "pending_approval"; connectionType: ConnectionType }
  | { kind: "already_connected"; connectionStatus: string; connectionType: ConnectionType };

export async function recordSwipe(
  ctx: MatchingContext,
  selfConnectionTypes: ConnectionType[],
  targetProfileId: string,
  decision: SwipeDecision,
  provider: MatchingService,
): Promise<SwipeOutcome> {
  if (targetProfileId === ctx.selfProfileId) {
    return { kind: "rejected", reason: "self" };
  }

  const selfBilateralTypes = sharedBilateralTypes(
    selfConnectionTypes,
    selfConnectionTypes,
  );
  const lockKey = pairLockKey(ctx.clinicId, ctx.selfProfileId, targetProfileId);

  return db.transaction(async (tx) => {
    // 4) Advisory lock de 64 bits por par (antes de consultar/insertar swipe).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

    // 5) Revalidar filtros duros (sin el filtro 9; el swipe gestiona el conflicto).
    const target = await validatePairForSwipe(
      tx,
      ctx,
      selfBilateralTypes,
      targetProfileId,
    );
    if (!target) return { kind: "rejected", reason: "not_discoverable" };

    // 6) Filtro 12: compatibilidad real del provider (no se fabrica).
    const compat = (await provider.scoreCandidates(tx, ctx, [targetProfileId])).get(
      targetProfileId,
    );
    if (!compat) return { kind: "rejected", reason: "no_compatibility" };

    // 7) Inserción inmutable: primera decisión válida gana.
    await tx
      .insert(schema.swipes)
      .values({
        id: randomUUID(),
        clinicId: ctx.clinicId,
        actorPatientId: ctx.selfProfileId,
        targetPatientId: targetProfileId,
        decision,
      })
      .onConflictDoNothing();

    // 8) Leer decisión persistida.
    const [persisted] = await tx
      .select({ decision: schema.swipes.decision })
      .from(schema.swipes)
      .where(
        and(
          eq(schema.swipes.clinicId, ctx.clinicId),
          eq(schema.swipes.actorPatientId, ctx.selfProfileId),
          eq(schema.swipes.targetPatientId, targetProfileId),
        ),
      )
      .limit(1);

    // 9) Si difiere de la solicitada, conflicto controlado (sin mutación).
    if (!persisted) return { kind: "rejected", reason: "not_discoverable" };
    if (persisted.decision !== decision) {
      return { kind: "conflict", persistedDecision: persisted.decision };
    }

    // 10) pass: idempotente, sin conexión.
    if (decision === "pass") return { kind: "pass" };

    // 11) like: buscar recíproco.
    const [reciprocal] = await tx
      .select({ id: schema.swipes.id })
      .from(schema.swipes)
      .where(
        and(
          eq(schema.swipes.clinicId, ctx.clinicId),
          eq(schema.swipes.actorPatientId, targetProfileId),
          eq(schema.swipes.targetPatientId, ctx.selfProfileId),
          eq(schema.swipes.decision, "like"),
        ),
      )
      .limit(1);

    // 12) sin recíproco.
    if (!reciprocal) return { kind: "liked" };

    // 13) tipo bilateral (simétrico).
    const connectionType = resolveSuggestedType(
      selfConnectionTypes,
      target.connectionTypes,
    );
    if (!connectionType) return { kind: "rejected", reason: "no_type" };

    // 14) garantizar score persistido (invariante: match_score_id no nulo).
    const ensured = await provider.ensureScoreRow(tx, ctx, targetProfileId);
    if (!ensured) return { kind: "rejected", reason: "no_score" };

    // 15) insertar UNA sola conexión pending_approval (par canónico).
    const [a, b] = canonicalUuidPair(ctx.selfProfileId, targetProfileId);
    const insertedConn = await tx
      .insert(schema.connections)
      .values({
        id: randomUUID(),
        clinicId: ctx.clinicId,
        patientAId: a,
        patientBId: b,
        matchScoreId: ensured.matchScoreId,
        connectionType,
        status: "pending_approval",
      })
      .onConflictDoNothing()
      .returning({ id: schema.connections.id });

    if (insertedConn.length > 0) {
      return { kind: "matched", connectionStatus: "pending_approval", connectionType };
    }

    // 17) la conexión ya existía (creada concurrentemente): devolver estado.
    const [existing] = await tx
      .select({
        status: schema.connections.status,
        connectionType: schema.connections.connectionType,
      })
      .from(schema.connections)
      .where(
        and(
          eq(schema.connections.clinicId, ctx.clinicId),
          eq(schema.connections.patientAId, a),
          eq(schema.connections.patientBId, b),
        ),
      )
      .limit(1);
    return {
      kind: "already_connected",
      connectionStatus: existing?.status ?? "pending_approval",
      connectionType: (existing?.connectionType as ConnectionType) ?? connectionType,
    };
  });
}
