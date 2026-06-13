import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema } from "../../db";
import { canonicalUuidPair } from "../../domain/pairs";
import {
  clampUnit,
  type EnsuredScore,
  type MatchingContext,
  type MatchingService,
  type PairCompatibility,
  type Reader,
  type Transaction,
} from "../types";

/**
 * Provider pgvector: similitud coseno sobre `social.profile_embeddings`.
 * - Recibe solo ids que ya pasaron filtros duros.
 * - Si falta cualquier embedding, devuelve vacío/null de forma controlada.
 * - No llama APIs externas ni genera embeddings ni inventa scores.
 * - Persiste `source=calculated` SOLO al asegurar el score para una conexión.
 * - La explicación se construye únicamente con datos sociales.
 */
export class PgVectorMatchingService implements MatchingService {
  readonly name = "pgvector" as const;

  async scoreCandidates(
    ex: Reader,
    ctx: MatchingContext,
    eligibleProfileIds: string[],
  ): Promise<Map<string, PairCompatibility>> {
    const result = new Map<string, PairCompatibility>();
    if (eligibleProfileIds.length === 0) return result;

    const [selfEmbedding] = await ex
      .select({ id: schema.profileEmbeddings.id })
      .from(schema.profileEmbeddings)
      .where(
        and(
          eq(schema.profileEmbeddings.clinicId, ctx.clinicId),
          eq(schema.profileEmbeddings.patientProfileId, ctx.selfProfileId),
        ),
      )
      .limit(1);

    // Sin embedding propio => estado controlado (deck vacío).
    if (!selfEmbedding) return result;

    const rows = await ex
      .select({
        id: schema.profileEmbeddings.patientProfileId,
        score: sql<number>`1 - (${schema.profileEmbeddings.embedding} <=> (
          select pe.embedding from social.profile_embeddings pe
          where pe.clinic_id = ${ctx.clinicId}
            and pe.patient_profile_id = ${ctx.selfProfileId}
          limit 1
        ))`,
      })
      .from(schema.profileEmbeddings)
      .where(
        and(
          eq(schema.profileEmbeddings.clinicId, ctx.clinicId),
          inArray(schema.profileEmbeddings.patientProfileId, eligibleProfileIds),
        ),
      );

    for (const row of rows) {
      result.set(row.id, {
        score: clampUnit(Number(row.score)),
        explanation: null, // la capa de discovery construye explicación social
        source: "calculated",
        matchScoreId: null,
      });
    }
    return result;
  }

  async ensureScoreRow(
    tx: Transaction,
    ctx: MatchingContext,
    targetProfileId: string,
  ): Promise<EnsuredScore | null> {
    const scoreRows = await tx.execute<{ score: number | string }>(sql`
      select 1 - (a.embedding <=> b.embedding) as score
      from social.profile_embeddings a, social.profile_embeddings b
      where a.clinic_id = ${ctx.clinicId} and a.patient_profile_id = ${ctx.selfProfileId}
        and b.clinic_id = ${ctx.clinicId} and b.patient_profile_id = ${targetProfileId}
      limit 1
    `);

    const first = scoreRows[0];
    if (!first) return null; // falta algún embedding => controlado
    const score = clampUnit(Number(first.score));
    const explanation = await this.buildSocialExplanation(tx, ctx, targetProfileId);

    const [a, b] = canonicalUuidPair(ctx.selfProfileId, targetProfileId);
    const [row] = await tx
      .insert(schema.matchScores)
      .values({
        id: randomUUID(),
        clinicId: ctx.clinicId,
        patientAId: a,
        patientBId: b,
        score,
        explanation,
        source: "calculated",
        hardFiltersPassed: true,
      })
      .onConflictDoUpdate({
        target: [
          schema.matchScores.clinicId,
          schema.matchScores.patientAId,
          schema.matchScores.patientBId,
        ],
        set: {
          score,
          explanation,
          source: "calculated",
          hardFiltersPassed: true,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: schema.matchScores.id,
        score: schema.matchScores.score,
        explanation: schema.matchScores.explanation,
      });

    if (!row) return null;
    return {
      matchScoreId: row.id,
      score: clampUnit(Number(row.score)),
      explanation: row.explanation,
    };
  }

  private async buildSocialExplanation(
    tx: Transaction,
    ctx: MatchingContext,
    targetProfileId: string,
  ): Promise<string> {
    const rows = await tx
      .select({
        profileId: schema.patientInterests.patientProfileId,
        name: schema.interests.name,
        slug: schema.interests.slug,
      })
      .from(schema.patientInterests)
      .innerJoin(
        schema.interests,
        and(
          eq(schema.patientInterests.clinicId, schema.interests.clinicId),
          eq(schema.patientInterests.interestId, schema.interests.id),
        ),
      )
      .where(
        and(
          eq(schema.patientInterests.clinicId, ctx.clinicId),
          inArray(schema.patientInterests.patientProfileId, [
            ctx.selfProfileId,
            targetProfileId,
          ]),
        ),
      );

    const selfSlugs = new Set(
      rows.filter((r) => r.profileId === ctx.selfProfileId).map((r) => r.slug),
    );
    const sharedNames = rows
      .filter((r) => r.profileId === targetProfileId && selfSlugs.has(r.slug))
      .map((r) => r.name);

    if (sharedNames.length > 0) {
      return `Compatibilidad social por intereses en común: ${sharedNames.join(", ")}.`;
    }
    return "Compatibilidad basada en su perfil social.";
  }
}
