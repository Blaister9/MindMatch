import { evaluateR1 } from "./rule-r1";
import { evaluateR2 } from "./rule-r2";
import { evaluateR3 } from "./rule-r3";
import { evaluateR4 } from "./rule-r4";
import { evaluateR5 } from "./rule-r5";
import type { RuleAlertCandidate, RuleContext } from "./types";

export function evaluatePatientPulse(ctx: RuleContext): RuleAlertCandidate[] {
  return [
    evaluateR1(ctx),
    evaluateR2(ctx),
    evaluateR3(ctx),
    evaluateR4(ctx),
    evaluateR5(ctx),
  ].filter((item): item is RuleAlertCandidate => item !== null);
}
