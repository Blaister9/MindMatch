import type { PatientKey } from "./patients";

/**
 * Secuencias de check-in por paciente: 14 días consecutivos, del más antiguo
 * (índice 0) al más reciente (índice 13 = hoy en Bogotá).
 *
 * Invariantes de diseño (verificadas matemáticamente en verify-demo-seed.ts):
 * - Solo Mariana dispara R1 y R2 (patrón descendente en los últimos días).
 * - Sueño siempre >= 3 => nadie dispara R4 (sueño <= 2 por 4+ días).
 * - Ninguna corrida de días sin conexión llega a 7 => nadie dispara R5.
 * - 14 días consecutivos sin huecos => nadie dispara R3.
 * - Ánimo de los otros 7 nunca <= 2 => nadie más dispara R2.
 */
export interface CheckInSeries {
  readonly mood: number[];
  readonly sleep: number[];
  readonly connected: boolean[];
}

const T = true;
const F = false;

export const CHECK_INS: Record<PatientKey, CheckInSeries> = {
  mariana: {
    mood: [4, 4, 5, 4, 4, 5, 4, 4, 3, 3, 2, 2, 2, 1],
    sleep: [4, 4, 3, 4, 3, 4, 3, 3, 4, 3, 3, 3, 3, 3],
    connected: [T, F, T, T, F, T, F, T, T, F, T, F, T, T],
  },
  daniel: {
    mood: [4, 4, 3, 4, 5, 4, 4, 3, 4, 4, 5, 4, 4, 4],
    sleep: [4, 4, 4, 3, 4, 4, 3, 4, 4, 4, 3, 4, 4, 4],
    connected: [T, T, F, T, F, T, T, F, T, F, T, T, F, T],
  },
  laura: {
    mood: [3, 4, 4, 4, 3, 4, 5, 4, 4, 3, 4, 4, 5, 4],
    sleep: [3, 4, 4, 3, 4, 4, 4, 3, 4, 4, 3, 4, 4, 4],
    connected: [F, T, T, F, T, F, T, T, F, T, F, T, T, F],
  },
  andres: {
    mood: [5, 4, 4, 5, 4, 4, 3, 4, 4, 5, 4, 4, 4, 5],
    sleep: [4, 5, 4, 4, 4, 3, 4, 4, 5, 4, 4, 3, 4, 4],
    connected: [T, F, F, T, F, T, T, F, T, F, F, T, F, T],
  },
  valentina: {
    mood: [4, 3, 4, 4, 4, 3, 4, 4, 3, 4, 4, 4, 3, 4],
    sleep: [4, 4, 3, 4, 4, 3, 4, 4, 3, 4, 4, 3, 4, 4],
    connected: [T, T, F, T, T, F, T, F, T, T, F, T, F, T],
  },
  camilo: {
    mood: [4, 4, 5, 4, 4, 4, 3, 4, 4, 4, 5, 4, 4, 4],
    sleep: [5, 4, 4, 4, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4],
    connected: [F, T, F, T, F, T, F, T, F, T, F, T, F, T],
  },
  juliana: {
    mood: [3, 4, 4, 3, 4, 4, 4, 5, 4, 4, 3, 4, 4, 4],
    sleep: [4, 4, 3, 4, 4, 4, 3, 4, 4, 3, 4, 4, 4, 3],
    connected: [T, F, T, T, F, T, F, T, T, F, T, F, T, T],
  },
  felipe: {
    mood: [4, 5, 4, 4, 4, 3, 4, 4, 4, 5, 4, 4, 3, 4],
    sleep: [4, 4, 5, 4, 4, 3, 4, 4, 5, 4, 4, 3, 4, 4],
    connected: [F, T, F, T, T, F, T, F, T, T, F, T, F, T],
  },
};

export const CHECK_IN_DAYS = 14;
