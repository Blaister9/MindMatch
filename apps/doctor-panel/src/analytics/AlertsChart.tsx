import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AlertsAggregationResponse } from "@mindmatch/shared";
import { fetchAnalyticsAlerts } from "../lib/api";
import { ChartShell } from "./ChartShell";

export function AlertsChart({ token }: { token: string }) {
  const [data, setData] = useState<AlertsAggregationResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    fetchAnalyticsAlerts(token)
      .then((d) => active && (setData(d), setStatus("ready")))
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, [token]);

  const byRule = data?.byRuleCode.map((r) => ({ name: r.ruleCode, count: r.count })) ?? [];

  return (
    <ChartShell
      title="Alertas por tipo"
      description="Alertas del Pulso agrupadas por regla en el periodo."
      status={status}
      empty={(data?.total ?? 0) === 0}
      emptyHint="No hay alertas en el periodo."
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={byRule} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" fontSize={12} />
          <YAxis allowDecimals={false} fontSize={12} />
          <Tooltip />
          <Bar dataKey="count" fill="#8f5f6f" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-slate-500">
        Total: {data?.total ?? 0} ·{" "}
        {(data?.bySeverity ?? []).map((s) => `${s.severity}: ${s.count}`).join(" · ")}
      </p>
    </ChartShell>
  );
}
