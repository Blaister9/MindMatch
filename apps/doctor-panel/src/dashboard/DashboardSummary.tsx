import { useCallback, useEffect, useState } from "react";
import type { DashboardSummary } from "@mindmatch/shared";
import { fetchDashboardSummary } from "../lib/api";

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-3xl font-extrabold text-brand-600">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </div>
  );
}

export function DashboardSummaryCards({ token }: { token: string }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setSummary(await fetchDashboardSummary(token));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-label="Resumen operativo">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-800">Sala de control</h2>
          {summary && (
            <span className="text-sm text-slate-500">
              · {new Date(`${summary.today}T12:00:00-05:00`).toLocaleDateString("es-CO", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
          )}
          {summary?.demoMode && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              Modo demo
            </span>
          )}
        </div>
        <button className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => void load()}>
          Actualizar
        </button>
      </div>

      {status === "loading" && <p className="text-slate-500">Cargando métricas…</p>}
      {status === "error" && (
        <p className="text-red-600">
          No se pudieron cargar las métricas.{" "}
          <button className="underline" onClick={() => void load()}>
            Reintentar
          </button>
        </p>
      )}
      {status === "ready" && summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Pacientes activos" value={summary.activePatients} />
          <Metric label="Check-ins de hoy" value={summary.checkInsToday} />
          <Metric
            label={`Alertas abiertas (${summary.openAlertsToday} disparadas hoy)`}
            value={summary.openAlertsTotal}
          />
          <Metric label="Matches pendientes" value={summary.pendingMatches} />
        </div>
      )}
    </section>
  );
}
