/**
 * Ancla de fechas del seed.
 *
 * Se calcula UNA sola vez al inicio del proceso: el "hoy" en `America/Bogota`.
 * Todas las fechas/horas del dataset derivan de esta ancla, de forma
 * independiente de la zona horaria del sistema operativo. Bogotá es UTC-5 fijo
 * (sin horario de verano), así que construimos los `timestamptz` con el offset
 * explícito `-05:00`.
 */

const BOGOTA_TZ = "America/Bogota";
const BOGOTA_OFFSET = "-05:00";

function computeTodayInBogota(): string {
  // en-CA produce el formato YYYY-MM-DD.
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function ymdToUtcMidnight(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error(`Fecha YYYY-MM-DD inválida: ${ymd}`);
  }
  return new Date(Date.UTC(year, month - 1, day));
}

function utcToYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface SeedAnchor {
  /** "Hoy" en Bogotá, YYYY-MM-DD. */
  readonly today: string;
  /** Fecha (YYYY-MM-DD) a `daysAgo` días antes del ancla. */
  date(daysAgo: number): string;
  /** Días transcurridos entre `ymd` y el ancla (offset >= 0 hacia el pasado). */
  offsetFromToday(ymd: string): number;
  /** `timestamptz` para una fecha local de Bogotá a la hora HH:MM. */
  timestamp(ymd: string, hhmm: string): Date;
  /** Edad cumplida en el día ancla a partir de una fecha de nacimiento. */
  ageOn(birthYmd: string): number;
}

export function createAnchor(todayOverride?: string): SeedAnchor {
  const today = todayOverride ?? computeTodayInBogota();

  return {
    today,
    date(daysAgo: number): string {
      const base = ymdToUtcMidnight(today);
      base.setUTCDate(base.getUTCDate() - daysAgo);
      return utcToYmd(base);
    },
    offsetFromToday(ymd: string): number {
      const a = ymdToUtcMidnight(today).getTime();
      const b = ymdToUtcMidnight(ymd).getTime();
      return Math.round((a - b) / 86_400_000);
    },
    timestamp(ymd: string, hhmm: string): Date {
      return new Date(`${ymd}T${hhmm}:00${BOGOTA_OFFSET}`);
    },
    ageOn(birthYmd: string): number {
      const [by, bm, bd] = birthYmd.split("-").map(Number);
      const [ay, am, ad] = today.split("-").map(Number);
      if (!by || !bm || !bd || !ay || !am || !ad) {
        throw new Error(`Fechas inválidas para calcular edad: ${birthYmd}`);
      }
      let age = ay - by;
      if (am < bm || (am === bm && ad < bd)) {
        age -= 1;
      }
      return age;
    },
  };
}
