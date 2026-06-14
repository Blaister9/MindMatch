/**
 * Máquina pura del ejercicio de respiración 4-7-8 (Modo Calma). Calcula el
 * estado a partir del tiempo transcurrido (no decrementa con setInterval), para
 * resistir pestañas en segundo plano. El componente provee la fuente de tiempo
 * monotónica (performance.now()).
 */

export type CalmPhase = "inhale" | "hold" | "exhale";

export const CALM_SEQUENCE: ReadonlyArray<{ phase: CalmPhase; seconds: number }> = [
  { phase: "inhale", seconds: 4 },
  { phase: "hold", seconds: 7 },
  { phase: "exhale", seconds: 8 },
];

export const CALM_TOTAL_CYCLES = 3;
const CYCLE_MS = CALM_SEQUENCE.reduce((acc, s) => acc + s.seconds * 1000, 0); // 19000
const TOTAL_MS = CYCLE_MS * CALM_TOTAL_CYCLES; // 57000

export const CALM_PHASE_LABELS: Record<CalmPhase, string> = {
  inhale: "Inhala",
  hold: "Sostén",
  exhale: "Exhala",
};

export type CalmStatus = "idle" | "running" | "paused" | "finished";

export interface CalmMachineState {
  status: CalmStatus;
  /** Tiempo acumulado en estado `running` (ms), sin contar pausas. */
  elapsedMs: number;
  /** Marca monotónica del último resume; null si no está corriendo. */
  lastResumeAt: number | null;
}

export interface CalmView {
  phase: CalmPhase;
  /** Ciclo 1..CALM_TOTAL_CYCLES. */
  cycle: number;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  finished: boolean;
}

export function calmInitial(): CalmMachineState {
  return { status: "idle", elapsedMs: 0, lastResumeAt: null };
}

export function calmStart(_state: CalmMachineState, now: number): CalmMachineState {
  return { status: "running", elapsedMs: 0, lastResumeAt: now };
}

export function calmPause(state: CalmMachineState, now: number): CalmMachineState {
  if (state.status !== "running") return state;
  return {
    status: "paused",
    elapsedMs: calmElapsed(state, now),
    lastResumeAt: null,
  };
}

export function calmResume(state: CalmMachineState, now: number): CalmMachineState {
  if (state.status !== "paused") return state;
  return { status: "running", elapsedMs: state.elapsedMs, lastResumeAt: now };
}

export function calmFinish(state: CalmMachineState): CalmMachineState {
  return { status: "finished", elapsedMs: TOTAL_MS, lastResumeAt: null };
}

export function calmReset(): CalmMachineState {
  return calmInitial();
}

/** Tiempo transcurrido efectivo (ms), acotado a [0, TOTAL_MS]. */
export function calmElapsed(state: CalmMachineState, now: number): number {
  const running =
    state.status === "running" && state.lastResumeAt !== null
      ? now - state.lastResumeAt
      : 0;
  const total = state.elapsedMs + Math.max(0, running);
  return Math.min(TOTAL_MS, Math.max(0, total));
}

/** Estado visible derivado del tiempo transcurrido. */
export function calmView(elapsedMs: number): CalmView {
  const clamped = Math.min(TOTAL_MS, Math.max(0, elapsedMs));
  if (clamped >= TOTAL_MS) {
    const last = CALM_SEQUENCE[CALM_SEQUENCE.length - 1]!;
    return {
      phase: last.phase,
      cycle: CALM_TOTAL_CYCLES,
      phaseRemainingMs: 0,
      phaseDurationMs: last.seconds * 1000,
      finished: true,
    };
  }
  const cycleIndex = Math.floor(clamped / CYCLE_MS); // 0-based
  let withinCycle = clamped - cycleIndex * CYCLE_MS;
  for (const step of CALM_SEQUENCE) {
    const stepMs = step.seconds * 1000;
    if (withinCycle < stepMs) {
      return {
        phase: step.phase,
        cycle: cycleIndex + 1,
        phaseRemainingMs: stepMs - withinCycle,
        phaseDurationMs: stepMs,
        finished: false,
      };
    }
    withinCycle -= stepMs;
  }
  // Inalcanzable (withinCycle < CYCLE_MS), defensivo.
  const last = CALM_SEQUENCE[CALM_SEQUENCE.length - 1]!;
  return {
    phase: last.phase,
    cycle: cycleIndex + 1,
    phaseRemainingMs: 0,
    phaseDurationMs: last.seconds * 1000,
    finished: false,
  };
}

/** ¿El tiempo transcurrido completó el ejercicio? */
export function calmIsComplete(elapsedMs: number): boolean {
  return elapsedMs >= TOTAL_MS;
}

export const CALM_TOTAL_MS = TOTAL_MS;
export const CALM_CYCLE_MS = CYCLE_MS;
