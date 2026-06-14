import { addDays, lastNDates } from "./dates";
import { byDate, round2 } from "./rule-utils";
import type { RuleAlertCandidate, RuleContext } from "./types";

function evaluateR5At(ctx: RuleContext, asOfDate: string) {
  const dates = lastNDates(asOfDate, 7);
  const map = byDate(ctx.checkIns);
  const items = dates.map((date) => map.get(date));
  if (items.some((item) => !item || item.connectedWithSomeone)) return null;
  const values = items as NonNullable<(typeof items)[number]>[];
  const n = 7;
  const sumX = 21;
  const sumY = values.reduce((acc, item) => acc + item.mood, 0);
  const sumXY = values.reduce((acc, item, index) => acc + index * item.mood, 0);
  const numerator = n * sumXY - sumX * sumY;
  if (numerator > 0) return null;
  const denominator = n * 91 - sumX * sumX;
  return {
    asOfDate,
    windowStart: dates[0]!,
    windowEnd: asOfDate,
    daysWithoutConnection: 7,
    numerator,
    slope: round2(numerator / denominator),
    points: values.map((item) => ({
      date: item.date,
      mood: item.mood,
      connectedWithSomeone: item.connectedWithSomeone,
    })),
  };
}

function episodeStart(ctx: RuleContext): string | null {
  const current = evaluateR5At(ctx, ctx.asOfDate);
  if (!current) return null;
  let start = ctx.asOfDate;
  for (let cursor = addDays(ctx.asOfDate, -1); ; cursor = addDays(cursor, -1)) {
    if (!evaluateR5At(ctx, cursor)) break;
    start = cursor;
  }
  return start;
}

export function evaluateR5(ctx: RuleContext): RuleAlertCandidate | null {
  const evidence = evaluateR5At(ctx, ctx.asOfDate);
  if (!evidence) return null;
  const start = episodeStart(ctx);
  if (!start) return null;
  return {
    ruleCode: "R5",
    severity: "low",
    dedupeKey: `R5:${start}`,
    inputsJson: { ...evidence, episodeStartDate: start },
  };
}
