import type { AlertSeverity, PulseRuleCode } from "@mindmatch/shared";

export interface PulseCheckIn {
  readonly date: string;
  readonly mood: number;
  readonly sleep: number;
  readonly connectedWithSomeone: boolean;
}

export interface PulsePreference {
  readonly enabled: boolean;
  readonly enabledOn: string | null;
}

export interface RuleAlertCandidate {
  readonly ruleCode: Exclude<PulseRuleCode, "R6">;
  readonly severity: AlertSeverity;
  readonly dedupeKey: string;
  readonly inputsJson: Record<string, unknown>;
}

export interface RuleContext {
  readonly asOfDate: string;
  readonly checkIns: readonly PulseCheckIn[];
  readonly preference: PulsePreference | null;
}
