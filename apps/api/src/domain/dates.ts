/**
 * Fechas basadas en `America/Bogota` (UTC-5 fijo), independientes de la zona
 * horaria del servidor. Se usan para el filtro de mayoría de edad y para
 * calcular la edad mostrada (nunca se expone `birth_date`).
 */
const BOGOTA_TZ = "America/Bogota";

export function bogotaTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Fecha límite (YYYY-MM-DD) para tener >= 18 años respecto del día Bogotá. */
export function adultCutoffYmd(today: string = bogotaTodayYmd()): string {
  const [year, month, day] = today.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error(`Fecha inválida: ${today}`);
  }
  const cutoff = new Date(Date.UTC(year - 18, month - 1, day));
  return cutoff.toISOString().slice(0, 10);
}

/** Edad cumplida respecto del día Bogotá. */
export function ageFromBirthDate(
  birthYmd: string,
  today: string = bogotaTodayYmd(),
): number {
  const [by, bm, bd] = birthYmd.split("-").map(Number);
  const [ay, am, ad] = today.split("-").map(Number);
  if (!by || !bm || !bd || !ay || !am || !ad) {
    throw new Error(`Fechas inválidas para calcular edad: ${birthYmd} / ${today}`);
  }
  let age = ay - by;
  if (am < bm || (am === bm && ad < bd)) {
    age -= 1;
  }
  return age;
}
