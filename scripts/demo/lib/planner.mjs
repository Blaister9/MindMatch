/**
 * Planificadores puros para start/stop parcial. No tocan el SO directamente: reciben
 * el verificador de vida como dependencia inyectable para poder testearlos sin procesos.
 */

/**
 * Decide qué servicios iniciar:
 *  - active: ya vivos y verificados -> idempotentes, no se reinician.
 *  - stale: registrados pero muertos o con PID reutilizado -> se limpian del estado.
 *  - toStart: servicios a arrancar (incluye los stale ya limpiados).
 * Devuelve además nextState con los registros stale eliminados (sin mutar el original).
 */
export async function planStart(names, state, isAlive) {
  const services = { ...(state?.services || {}) };
  const active = [];
  const stale = [];
  const toStart = [];
  for (const name of names) {
    const existing = await isAlive(services[name]);
    if (existing.alive && existing.verified) {
      active.push(name);
      continue;
    }
    if (services[name]) {
      stale.push(name);
      delete services[name];
    }
    toStart.push(name);
  }
  const nextState = { ...(state || {}), services };
  return { active, stale, toStart, nextState };
}

/**
 * Aplica un stop parcial: elimina del estado solo los servicios indicados y conserva
 * intactos los hermanos. No muta el estado original.
 */
export function applyStop(state, names) {
  const services = { ...(state?.services || {}) };
  const removed = [];
  for (const name of names) {
    if (services[name]) {
      removed.push(name);
      delete services[name];
    }
  }
  return { removed, nextState: { ...(state || {}), services } };
}
