import { and, eq, inArray, or } from "drizzle-orm";
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
 * Provider demo: lee compatibilidad de `social.match_scores` sembrados.
 * Exige `source='demo'` y `hard_filters_passed=true`. No inventa scores: un par
 * sin fila no es descubrible.
 */
export class DemoMatchingService implements MatchingService {
  readonly name = "demo" as const;

  async scoreCandidates(
    ex: Reader,
    ctx: MatchingContext,
    eligibleProfileIds: string[],
  ): Promise<Map<string, PairCompatibility>> {
    const result = new Map<string, PairCompatibility>();
    if (eligibleProfileIds.length === 0) return result;

    const rows = await ex
      .select({
        id: schema.matchScores.id,
        a: schema.matchScores.patientAId,
        b: schema.matchScores.patientBId,
        score: schema.matchScores.score,
        explanation: schema.matchScores.explanation,
      })
      .from(schema.matchScores)
      .where(
        and(
          eq(schema.matchScores.clinicId, ctx.clinicId),
          eq(schema.matchScores.source, "demo"),
          eq(schema.matchScores.hardFiltersPassed, true),
          or(
            and(
              eq(schema.matchScores.patientAId, ctx.selfProfileId),
              inArray(schema.matchScores.patientBId, eligibleProfileIds),
            ),
            and(
              eq(schema.matchScores.patientBId, ctx.selfProfileId),
              inArray(schema.matchScores.patientAId, eligibleProfileIds),
            ),
          ),
        ),
      );

    for (const row of rows) {
      const other = row.a === ctx.selfProfileId ? row.b : row.a;
      result.set(other, {
        score: clampUnit(Number(row.score)),
        explanation: row.explanation,
        source: "demo",
        matchScoreId: row.id,
      });
    }
    return result;
  }

  async ensureScoreRow(
    tx: Transaction,
    ctx: MatchingContext,
    targetProfileId: string,
  ): Promise<EnsuredScore | null> {
    const [a, b] = canonicalUuidPair(ctx.selfProfileId, targetProfileId);
    const [row] = await tx
      .select({
        id: schema.matchScores.id,
        score: schema.matchScores.score,
        explanation: schema.matchScores.explanation,
      })
      .from(schema.matchScores)
      .where(
        and(
          eq(schema.matchScores.clinicId, ctx.clinicId),
          eq(schema.matchScores.patientAId, a),
          eq(schema.matchScores.patientBId, b),
          eq(schema.matchScores.source, "demo"),
          eq(schema.matchScores.hardFiltersPassed, true),
        ),
      )
      .limit(1);

    if (!row) return null;
    return {
      matchScoreId: row.id,
      score: clampUnit(Number(row.score)),
      explanation: row.explanation,
    };
  }
}
