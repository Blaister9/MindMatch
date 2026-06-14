import { describe, expect, it } from "vitest";
import { evaluatePatientPulse } from "./evaluate-pulse";
import type { PulseCheckIn } from "./types";
import { addDays } from "./dates";

function series(start: string, mood: number[], sleep?: number[], connected?: boolean[]): PulseCheckIn[] {
  return mood.map((value, index) => ({
    date: addDays(start, index),
    mood: value,
    sleep: sleep?.[index] ?? 4,
    connectedWithSomeone: connected?.[index] ?? true,
  }));
}

describe("pulse rules", () => {
  it("R1 usa comparacion entera exacta y dedupe por episodio", () => {
    const exact = series("2026-01-01", [4, 4, 4, 4, 4, 4, 4, 3, 2, 2]);
    const alerts = evaluatePatientPulse({
      asOfDate: "2026-01-10",
      checkIns: exact,
      preference: { enabled: true, enabledOn: "2026-01-01" },
    });
    expect(alerts.find((alert) => alert.ruleCode === "R1")).toMatchObject({
      dedupeKey: "R1:2026-01-10",
      severity: "medium",
    });

    const below = series("2026-01-01", [4, 4, 4, 4, 4, 3, 3, 3, 2, 2]);
    expect(
      evaluatePatientPulse({
        asOfDate: "2026-01-10",
        checkIns: below,
        preference: { enabled: true, enabledOn: "2026-01-01" },
      }).some((alert) => alert.ruleCode === "R1"),
    ).toBe(false);
  });

  it("R2 mantiene la misma clave durante la racha", () => {
    const alerts = evaluatePatientPulse({
      asOfDate: "2026-01-06",
      checkIns: series("2026-01-01", [4, 3, 2, 2, 2, 1]),
      preference: { enabled: true, enabledOn: "2026-01-01" },
    });
    expect(alerts.find((alert) => alert.ruleCode === "R2")?.dedupeKey).toBe("R2:2026-01-03");
  });

  it("R3 usa enabledOn, no updatedAt implicito", () => {
    const alerts = evaluatePatientPulse({
      asOfDate: "2026-01-12",
      checkIns: [],
      preference: { enabled: true, enabledOn: "2026-01-10" },
    });
    expect(alerts.find((alert) => alert.ruleCode === "R3")).toMatchObject({
      dedupeKey: "R3:2026-01-10",
      severity: "medium",
    });
    expect(
      evaluatePatientPulse({
        asOfDate: "2026-01-12",
        checkIns: [],
        preference: { enabled: false, enabledOn: null },
      }).some((alert) => alert.ruleCode === "R3"),
    ).toBe(false);
  });

  it("R5 usa numerador exacto de tendencia plana o negativa", () => {
    const flat = evaluatePatientPulse({
      asOfDate: "2026-01-07",
      checkIns: series("2026-01-01", [4, 4, 4, 4, 4, 4, 4], undefined, [false, false, false, false, false, false, false]),
      preference: { enabled: true, enabledOn: "2026-01-01" },
    });
    expect(flat.find((alert) => alert.ruleCode === "R5")?.dedupeKey).toBe("R5:2026-01-07");

    const positive = evaluatePatientPulse({
      asOfDate: "2026-01-07",
      checkIns: series("2026-01-01", [1, 2, 2, 3, 3, 4, 5], undefined, [false, false, false, false, false, false, false]),
      preference: { enabled: true, enabledOn: "2026-01-01" },
    });
    expect(positive.some((alert) => alert.ruleCode === "R5")).toBe(false);
  });
});
