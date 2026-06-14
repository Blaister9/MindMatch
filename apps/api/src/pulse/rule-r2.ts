import { consecutiveLowStreak } from "./rule-utils";
import type { RuleAlertCandidate, RuleContext } from "./types";

export function evaluateR2(ctx: RuleContext): RuleAlertCandidate | null {
  const streak = consecutiveLowStreak(ctx.checkIns, ctx.asOfDate, "mood", 2);
  if (streak.length < 3) return null;
  const streakStart = streak[0]!.date;
  return {
    ruleCode: "R2",
    severity: "high",
    dedupeKey: `R2:${streakStart}`,
    inputsJson: {
      asOfDate: ctx.asOfDate,
      streakStart,
      streakEnd: ctx.asOfDate,
      streakLength: streak.length,
      days: streak.map((item) => ({ date: item.date, mood: item.mood })),
    },
  };
}
