import { useCallback, useEffect, useState } from "react";
import type { DoctorAlert, PulseHistoryPoint } from "@mindmatch/shared";
import { fetchDoctorAlerts, manageAlert, simulateDay } from "../lib/api";

function MiniChart({ points }: { points: PulseHistoryPoint[] }) {
  const valid = points.filter((point) => point.mood !== null);
  const path = valid
    .map((point, index) => {
      const x = valid.length <= 1 ? 0 : (index / (valid.length - 1)) * 100;
      const y = 100 - (((point.mood ?? 1) - 1) / 4) * 100;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div>
      <svg viewBox="0 0 100 100" className="h-16 w-32" role="img" aria-label="Mini grafica de animo">
        <path d="M 0 100 H 100" stroke="#e2e8f0" />
        {path && <path d={path} fill="none" stroke="#256555" strokeWidth="5" strokeLinecap="round" />}
      </svg>
      <p className="text-xs text-slate-500">{valid.length} puntos</p>
    </div>
  );
}

function Evidence({ alert }: { alert: DoctorAlert }) {
  const e = alert.evidence;
  if (e.ruleCode === "R1") return <span>Caida {e.drop} entre {e.windowStart} y {e.windowEnd}</span>;
  if (e.ruleCode === "R2" || e.ruleCode === "R4") return <span>Racha de {e.streakLength} dias desde {e.streakStart}</span>;
  if (e.ruleCode === "R3") return <span>{e.daysWithoutCheckIn} dias sin check-in desde {e.absenceStart}</span>;
  if (e.ruleCode === "R5") return <span>{e.daysWithoutConnection} dias sin conexion, pendiente {e.slope}</span>;
  return <span>Categoria {e.reasonCategory}</span>;
}

export function PulseAlerts({ token }: { token: string }) {
  const [alerts, setAlerts] = useState<DoctorAlert[]>([]);
  const [status, setStatus] = useState<"open" | "managed" | "all">("open");
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [message, setMessage] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDoctorAlerts(token, status);
      setAlerts(data.alerts);
    } finally {
      setLoading(false);
    }
  }, [status, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onManage(alertId: string) {
    await manageAlert(token, alertId);
    await load();
  }

  async function onSimulate() {
    const id = requestId ?? crypto.randomUUID();
    setRequestId(id);
    setSimulating(true);
    try {
      const result = await simulateDay(token, id);
      setMessage(`Dia ${result.currentDate}: ${result.insertedCheckIns} check-ins, ${result.createdAlerts.length} alertas.`);
      await load();
    } finally {
      setSimulating(false);
      setRequestId(null);
    }
  }

  const severityClass = {
    low: "bg-emerald-50 text-emerald-700",
    medium: "bg-amber-50 text-amber-700",
    high: "bg-red-50 text-red-700",
  } as const;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Pulso emocional</h2>
          <p className="text-sm text-slate-500">Alertas deterministicas R1-R6</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="field" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="open">Abiertas</option>
            <option value="managed">Gestionadas</option>
            <option value="all">Todas</option>
          </select>
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" disabled={simulating} onClick={() => void onSimulate()}>
            Simular dia
          </button>
        </div>
      </div>
      {message && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{message}</p>}
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Cargando alertas...</p>
      ) : (
        <div className="mt-4 space-y-3">
          {alerts.map((alert) => (
            <article key={alert.alertId} className="grid gap-4 rounded-lg border border-slate-200 p-4 md:grid-cols-[1fr_auto_auto]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-800">{alert.patientDisplayName}</p>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${severityClass[alert.severity]}`}>
                    {alert.severity}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{alert.ruleCode}</span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-700">{alert.ruleName}</p>
                <p className="text-sm text-slate-500">{alert.ruleDescription}</p>
                <p className="mt-1 text-xs text-slate-500"><Evidence alert={alert} /></p>
              </div>
              <MiniChart points={alert.miniSeries} />
              <div className="text-right text-sm">
                <p className="text-slate-500">{new Date(alert.triggeredAt).toLocaleString("es-CO")}</p>
                {alert.status === "open" ? (
                  <button className="mt-2 rounded-lg bg-brand-600 px-3 py-2 font-semibold text-white" onClick={() => void onManage(alert.alertId)}>
                    Gestionar
                  </button>
                ) : (
                  <p className="mt-2 font-semibold text-slate-500">Gestionada</p>
                )}
              </div>
            </article>
          ))}
          {alerts.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No hay alertas para este filtro.</p>}
        </div>
      )}
    </section>
  );
}
