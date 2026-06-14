import { addDays, daysBetween } from "./dates";
import type { RuleAlertCandidate, RuleContext } from "./types";

export function evaluateR3(ctx: RuleContext): RuleAlertCandidate | null {
  if (!ctx.preference?.enabled || !ctx.preference.enabledOn) return null;
  if (daysBetween(ctx.preference.enabledOn, ctx.asOfDate) < 0) return null;
  const sorted = [...ctx.checkIns].filter((item) => item.date <= ctx.asOfDate).sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1);
  const absenceStart = last ? addDays(last.date, 1) : ctx.preference.enabledOn;
  const absenceDays = last
    ? daysBetween(last.date, ctx.asOfDate)
    : daysBetween(ctx.preference.enabledOn, ctx.asOfDate) + 1;
  if (absenceDays < 3) return null;
  return {
    ruleCode: "R3",
    severity: "medium",
    dedupeKey: `R3:${absenceStart}`,
    inputsJson: {
      asOfDate: ctx.asOfDate,
      lastCheckInDate: last?.date ?? null,
      absenceStart,
      daysWithoutCheckIn: absenceDays,
    },
  };
}
