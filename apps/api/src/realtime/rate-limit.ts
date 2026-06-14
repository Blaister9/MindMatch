/**
 * Límites in-memory (instancia única). Producción multi-instancia requeriría
 * almacenamiento compartido / Redis adapter (documentado).
 */
export const MESSAGE_LIMIT = 10;
export const MESSAGE_WINDOW_MS = 10_000;
export const TYPING_THROTTLE_MS = 750;
export const REPORT_LIMIT = 5;
export const REPORT_WINDOW_MS = 60_000;
export const MAX_ROOMS_PER_SOCKET = 20;

const messageHits = new Map<string, number[]>();
const typingLast = new Map<string, number>();
const reportHits = new Map<string, number[]>();

function slidingAllow(
  map: Map<string, number[]>,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): boolean {
  const cutoff = now - windowMs;
  const hits = (map.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limit) {
    map.set(key, hits);
    return false;
  }
  hits.push(now);
  map.set(key, hits);
  return true;
}

export function allowMessage(userId: string, now = Date.now()): boolean {
  return slidingAllow(messageHits, userId, MESSAGE_LIMIT, MESSAGE_WINDOW_MS, now);
}

export function allowReport(key: string, now = Date.now()): boolean {
  return slidingAllow(reportHits, key, REPORT_LIMIT, REPORT_WINDOW_MS, now);
}

export function allowTyping(key: string, now = Date.now()): boolean {
  const last = typingLast.get(key) ?? 0;
  if (now - last < TYPING_THROTTLE_MS) return false;
  typingLast.set(key, now);
  return true;
}

/** Limpieza para tests / shutdown. */
export function resetRateState(): void {
  messageHits.clear();
  typingLast.clear();
  reportHits.clear();
}
