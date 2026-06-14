import { useEffect, useState } from "react";
import type { FunnelResponse } from "@mindmatch/shared";
import { fetchAnalyticsFunnel } from "../lib/api";
import { ChartShell } from "./ChartShell";

export function AdoptionFunnel({ token }: { token: string }) {
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    fetchAnalyticsFunnel(token)
      .then((d) => active && (setData(d), setStatus("ready")))
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, [token]);

  const max = data ? Math.max(1, ...data.stages.map((s) => s.patients)) : 1;

  return (
    <ChartShell
      title="Embudo de adopción"
      description={data?.cohortLabel ?? "Conversión de pacientes invitados en el periodo."}
      status={status}
      empty={(data?.stages[0]?.patients ?? 0) === 0}
      emptyHint="No hay invitaciones en el periodo."
    >
      <ul className="space-y-2">
        {data?.stages.map((stage) => (
          <li key={stage.key}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{stage.label}</span>
              <span className="font-semibold text-slate-800">{stage.patients}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-brand-500"
                style={{ width: `${(stage.patients / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {data?.dataQualityWarning && (
        <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
          <p>
            Los datos históricos contienen etapas posteriores sin registro de una
            etapa previa. Los valores se muestran sin ajustes.
          </p>
          <ul className="mt-1 list-disc pl-4">
            {data.dataQualityIssues.map((issue) => (
              <li key={`${issue.previousStage}-${issue.currentStage}`}>
                {issue.currentStage} ({issue.currentCount}) &gt; {issue.previousStage} (
                {issue.previousCount})
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartShell>
  );
}
