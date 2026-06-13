import type { db } from "../db";

/** Solo lectura: acepta tanto `db` como una transacción. */
export type Reader = Pick<typeof db, "select">;
/** Transacción de Drizzle (insert/update/delete/select/execute). */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface MatchingContext {
  readonly clinicId: string;
  readonly selfProfileId: string;
}

export interface PairCompatibility {
  /** Score normalizado en [0,1]. */
  readonly score: number;
  readonly explanation: string | null;
  readonly source: "demo" | "calculated";
  /** Id de la fila `match_scores` si ya está persistida (demo siempre). */
  readonly matchScoreId: string | null;
}

export interface EnsuredScore {
  readonly matchScoreId: string;
  readonly score: number;
  readonly explanation: string | null;
}

export interface MatchingService {
  readonly name: "demo" | "pgvector";

  /**
   * Puntúa candidatos YA filtrados por filtros duros. Devuelve un mapa
   * targetProfileId -> compatibilidad. Candidatos sin compatibilidad no
   * aparecen en el mapa (no se inventan scores).
   */
  scoreCandidates(
    ex: Reader,
    ctx: MatchingContext,
    eligibleProfileIds: string[],
  ): Promise<Map<string, PairCompatibility>>;

  /**
   * Garantiza una fila `match_scores` persistida para el par (antes de crear
   * una conexión). Demo: reutiliza la fila sembrada. pgvector: inserta/actualiza
   * `source=calculated`. Devuelve null si no hay base para puntuar.
   */
  ensureScoreRow(
    tx: Transaction,
    ctx: MatchingContext,
    targetProfileId: string,
  ): Promise<EnsuredScore | null>;
}

export function clampUnit(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
