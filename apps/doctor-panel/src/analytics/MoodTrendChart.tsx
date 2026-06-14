import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MoodSeriesResponse } from "@mindmatch/shared";
import { fetchAnalyticsMood } from "../lib/api";
import { ChartShell } from "./ChartShell";

export function MoodTrendChart({ token }: { token: string }) {
  const [data, setData] = useState<MoodSeriesResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    fetchAnalyticsMood(token)
      .then((d) => active && (setData(d), setStatus("ready")))
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, [token]);

  const points =
    data?.points.map((p) => ({
      date: p.date.slice(5),
      average: p.average,
      sampleSize: p.sampleSize,
    })) ?? [];

  return (
    <ChartShell
      title="Ánimo colectivo"
      description="Promedio de ánimo entre pacientes que completaron el Pulso ese día."
      status={status}
      empty={data?.dataStatus === "not_generated"}
      emptyHint="Ejecuta analytics:refresh para generar las métricas."
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" fontSize={12} />
          <YAxis domain={[1, 5]} fontSize={12} />
          <Tooltip
            formatter={(value, _name, item) => {
              const sample = (item?.payload as { sampleSize?: number })?.sampleSize ?? 0;
              const text = typeof value === "number" ? value.toFixed(2) : "Sin datos";
              return [text, `Promedio (n=${sample})`];
            }}
          />
          <Line type="monotone" dataKey="average" stroke="#4f6f8f" strokeWidth={2} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <details className="mt-2 text-xs text-slate-500">
        <summary>Ver datos</summary>
        <ul className="mt-1 space-y-0.5">
          {points.map((p) => (
            <li key={p.date}>
              {p.date}: {p.average == null ? "sin datos" : p.average.toFixed(2)} (n={p.sampleSize})
            </li>
          ))}
        </ul>
      </details>
    </ChartShell>
  );
}
