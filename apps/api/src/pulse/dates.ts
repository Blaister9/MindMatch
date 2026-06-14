const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertYmd(value: string): string {
  if (!YMD_RE.test(value)) throw new Error(`Fecha invalida: ${value}`);
  return value;
}

export function addDays(ymd: string, days: number): string {
  assertYmd(ymd);
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  assertYmd(fromYmd);
  assertYmd(toYmd);
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  const from = Date.UTC(fy!, fm! - 1, fd!);
  const to = Date.UTC(ty!, tm! - 1, td!);
  return Math.floor((to - from) / 86_400_000);
}

export function dateRange(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  for (let date = startYmd; date <= endYmd; date = addDays(date, 1)) {
    out.push(date);
  }
  return out;
}

export function lastNDates(asOfDate: string, days: number): string[] {
  return dateRange(addDays(asOfDate, 1 - days), asOfDate);
}
