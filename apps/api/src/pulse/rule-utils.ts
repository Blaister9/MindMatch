import { addDays } from "./dates";
import type { PulseCheckIn } from "./types";

export function byDate(checkIns: readonly PulseCheckIn[]): Map<string, PulseCheckIn> {
  return new Map([...checkIns].map((item) => [item.date, item]));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function consecutiveLowStreak(
  checkIns: readonly PulseCheckIn[],
  asOfDate: string,
  field: "mood" | "sleep",
  maxValue: number,
): PulseCheckIn[] {
  const map = byDate(checkIns);
  const out: PulseCheckIn[] = [];
  for (let date = asOfDate; ; date = addDays(date, -1)) {
    const item = map.get(date);
    if (!item || item[field] > maxValue) break;
    out.unshift(item);
  }
  return out;
}
