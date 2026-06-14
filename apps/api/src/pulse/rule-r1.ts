import { addDays, lastNDates } from "./dates";
import { byDate, round2 } from "./rule-utils";
import type { RuleAlertCandidate, RuleContext } from "./types";

function evaluateR1At(ctx: RuleContext, asOfDate: string) {
  const dates = lastNDates(asOfDate, 10);
  const map = byDate(ctx.checkIns);
  const items = dates.map((date) => map.get(date));
  if (items.some((item) => !item)) return null;
  const previous = items.slice(0, 7) as NonNullable<(typeof items)[number]>[];
  const recent = items.slice(7, 10) as NonNullable<(typeof items)[number]>[];
  const previousSum = previous.reduce((acc, item) => acc + item.mood, 0);
  const recentSum = recent.reduce((acc, item) => acc + item.mood, 0);
  if (6 * previousSum - 14 * recentSum < 63) return null;
  const previousAverage = round2(previousSum / 7);
  const recentAverage = round2(recentSum / 3);
  return {
    asOfDate,
    windowStart: dates[0]!,
    windowEnd: asOfDate,
    previous: previous.map((item) => ({ date: item.date, mood: item.mood })),
    recent: recent.map((item) => ({ date: item.date, mood: item.mood })),
    previousSum,
    recentSum,
    previousAverage,
    recentAverage,
    drop: round2(previousSum / 7 - recentSum / 3),
  };
}

function episodeStart(ctx: RuleContext): string | null {
  const current = evaluateR1At(ctx, ctx.asOfDate);
  if (!current) return null;
  let start = ctx.asOfDate;
  for (let cursor = addDays(ctx.asOfDate, -1); ; cursor = addDays(cursor, -1)) {
    if (!evaluateR1At(ctx, cursor)) break;
    start = cursor;
  }
  return start;
}

export function evaluateR1(ctx: RuleContext): RuleAlertCandidate | null {
  const evidence = evaluateR1At(ctx, ctx.asOfDate);
  if (!evidence) return null;
  const start = episodeStart(ctx);
  if (!start) return null;
  return {
    ruleCode: "R1",
    severity: "medium",
    dedupeKey: `R1:${start}`,
    inputsJson: { ...evidence, episodeStartDate: start },
  };
}
