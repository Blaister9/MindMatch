/**
 * Utilidad única para ordenar canónicamente un par de UUIDs antes de insertar
 * en `match_scores` y `connections`, que exigen `patient_a_id < patient_b_id`.
 *
 * Los UUID de `randomUUID()` son minúsculas; la comparación lexicográfica de
 * strings coincide con el orden del tipo `uuid` de PostgreSQL (los guiones van
 * en posiciones fijas y los dígitos hex se comparan igual que los bytes).
 */
export function canonicalUuidPair(x: string, y: string): readonly [string, string] {
  if (x === y) {
    throw new Error(`No se puede formar un par canónico con el mismo UUID: ${x}`);
  }
  return x < y ? [x, y] : [y, x];
}
