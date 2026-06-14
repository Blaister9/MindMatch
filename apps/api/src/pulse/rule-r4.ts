import { consecutiveLowStreak } from "./rule-utils";
import type { RuleAlertCandidate, RuleContext } from "./types";

export function evaluateR4(ctx: RuleContext): RuleAlertCandidate | null {
  const streak = consecutiveLowStreak(ctx.checkIns, ctx.asOfDate, "sleep", 2);
  if (streak.length < 4) return null;
  const streakStart = streak[0]!.date;
  return {
    ruleCode: "R4",
    severity: "medium",
    dedupeKey: `R4:${streakStart}`,
    inputsJson: {
      asOfDate: ctx.asOfDate,
      streakStart,
      streakEnd: ctx.asOfDate,
      streakLength: streak.length,
      days: streak.map((item) => ({ date: item.date, sleep: item.sleep })),
    },
  };
}
