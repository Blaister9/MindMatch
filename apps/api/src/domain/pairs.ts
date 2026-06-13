import type { ConnectionType } from "@mindmatch/shared";

/**
 * Ordena canónicamente un par de UUIDs (match_scores y connections exigen
 * `patient_a_id < patient_b_id`). La comparación lexicográfica de UUIDs en
 * minúscula coincide con el orden del tipo `uuid` de PostgreSQL.
 */
export function canonicalUuidPair(x: string, y: string): readonly [string, string] {
  if (x === y) {
    throw new Error(`No se puede formar un par canónico con el mismo UUID: ${x}`);
  }
  return x < y ? [x, y] : [y, x];
}

/**
 * Tipos de conexión BILATERALES para el swipe. `group` representa membresía de
 * grupo de apoyo (no una conexión bilateral) y queda excluido. La prioridad es
 * `friendship`, luego `romantic`: `romantic` solo se usa si es el único tipo
 * bilateral compartido.
 */
export const BILATERAL_TYPE_PRIORITY: readonly ConnectionType[] = [
  "friendship",
  "romantic",
];

export function sharedBilateralTypes(
  a: readonly ConnectionType[],
  b: readonly ConnectionType[],
): ConnectionType[] {
  const inB = new Set(b);
  return BILATERAL_TYPE_PRIORITY.filter((t) => a.includes(t) && inB.has(t));
}

/** Tipo bilateral sugerido (simétrico) o null si no comparten ninguno. */
export function resolveSuggestedType(
  a: readonly ConnectionType[],
  b: readonly ConnectionType[],
): ConnectionType | null {
  return sharedBilateralTypes(a, b)[0] ?? null;
}

/**
 * Clave estable de 64 bits para el advisory lock por par. Se canonicaliza el
 * par antes de construir la clave para que ambas direcciones bloqueen igual.
 */
export function pairLockKey(
  clinicId: string,
  profileX: string,
  profileY: string,
): string {
  const [a, b] = canonicalUuidPair(profileX, profileY);
  return `${clinicId}:${a}:${b}`;
}
