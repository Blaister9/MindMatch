import { useEffect, useState } from "react";
import type { MatchingMetricsResponse } from "@mindmatch/shared";
import { fetchAnalyticsSummary } from "../lib/api";
import { ChartShell } from "./ChartShell";

export function MatchingMetrics({ token }: { token: string }) {
  const [data, setData] = useState<MatchingMetricsResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    fetchAnalyticsSummary(token)
      .then((d) => active && (setData(d.matching), setStatus("ready")))
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, [token]);

  const rate =
    data?.approvalRate == null ? "—" : `${Math.round(data.approvalRate * 100)}%`;

  return (
    <ChartShell
      title="Matching"
      description="Tasa de aprobación = decisiones approve / total de decisiones profesionales. Las conexiones activas son estado operativo, no la misma métrica."
      status={status}
    >
      <dl className="grid grid-cols-2 gap-3">
        <Tile label="Tasa de aprobación" value={rate} hint={`${data?.approvedDecisions ?? 0}/${data?.professionalDecisionsTotal ?? 0} decisiones`} />
        <Tile label="Decisiones profesionales" value={String(data?.professionalDecisionsTotal ?? 0)} />
        <Tile label="Conexiones activas" value={String(data?.activeConnections ?? 0)} />
        <Tile label="Matches pendientes" value={String(data?.pendingMatches ?? 0)} />
      </dl>
    </ChartShell>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-2xl font-bold text-brand-600">{value}</dd>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
