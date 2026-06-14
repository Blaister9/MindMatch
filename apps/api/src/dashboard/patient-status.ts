import type { PatientStatusColor, PatientStatusReason } from "@mindmatch/shared";
import { daysBetween } from "../pulse/dates";

export interface PatientStatusInput {
  openAlertSeverities: Array<"low" | "medium" | "high">;
  lastCheckInDate: string | null;
  preferenceEnabled: boolean;
  enabledOn: string | null;
  today: string;
}

export interface PatientStatusResult {
  color: PatientStatusColor;
  reason: PatientStatusReason;
}

/**
 * Clasificación operativa determinística (NO clínica, sin risk_scores).
 * Prioridad: high open → red; 3+ días sin check-in → red; medium/low open →
 * yellow; 1-2 días sin check-in → yellow; si no, green. Alertas managed/dismissed
 * no afectan (solo se reciben severidades de alertas `open`).
 */
export function classifyPatientStatus(input: PatientStatusInput): PatientStatusResult {
  const hasHigh = input.openAlertSeverities.includes("high");
  const hasMediumOrLow = input.openAlertSeverities.some(
    (s) => s === "medium" || s === "low",
  );

  const stalenessApplies = input.preferenceEnabled;
  let staleDays = 0;
  if (stalenessApplies) {
    if (input.lastCheckInDate) {
      staleDays = Math.max(0, daysBetween(input.lastCheckInDate, input.today));
    } else if (input.enabledOn) {
      staleDays = Math.max(0, daysBetween(input.enabledOn, input.today));
    } else {
      staleDays = 0;
    }
  }

  if (hasHigh) return { color: "red", reason: "high_alert_open" };
  if (stalenessApplies && staleDays >= 3) {
    return { color: "red", reason: "check_in_missing_3_plus_days" };
  }
  if (hasMediumOrLow) return { color: "yellow", reason: "medium_or_low_alert_open" };
  if (stalenessApplies && staleDays >= 1) {
    return { color: "yellow", reason: "check_in_missing_1_2_days" };
  }
  if (!input.preferenceEnabled) {
    return { color: "green", reason: "preference_disabled_no_open_alerts" };
  }
  return { color: "green", reason: "up_to_date" };
}
