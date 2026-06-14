import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
import type {
  DoctorConnectionMetadata,
  DoctorReport,
  R6RealtimeEvent,
} from "@mindmatch/shared";
import { REPORT_REASON_LABELS } from "@mindmatch/shared";
import { fetchConnectionMetadata, fetchOpenReports } from "../lib/api";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export function ChatOversight({ token }: { token: string }) {
  const [connections, setConnections] = useState<DoctorConnectionMetadata[]>([]);
  const [reports, setReports] = useState<DoctorReport[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [badge, setBadge] = useState(0);
  const [toast, setToast] = useState<R6RealtimeEvent | null>(null);

  const load = useCallback(async () => {
    try {
      const [metadata, openReports] = await Promise.all([
        fetchConnectionMetadata(token),
        fetchOpenReports(token),
      ]);
      setConnections(metadata.connections);
      setReports(openReports.reports);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [token]);

  useEffect(() => {
    setStatus("loading");
    void load();
  }, [load]);

  useEffect(() => {
    const socket = io(API_URL, {
      path: "/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socket.on("report:created", (event: R6RealtimeEvent) => {
      setBadge((current) => current + 1);
      setToast(event);
      void load();
    });
    socket.on("auth:expired", () => socket.disconnect());
    return () => {
      socket.disconnect();
    };
  }, [load, token]);

  if (status === "loading") {
    return <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Cargando metadata de chat...</p>;
  }

  if (status === "error") {
    return (
      <section className="rounded-lg border border-red-200 bg-white p-4">
        <p className="text-sm text-red-700">No se pudo cargar la supervisión de chat.</p>
        <button className="mt-3 rounded-lg border px-3 py-2 text-sm" onClick={() => void load()}>
          Reintentar
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {toast && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Nuevo reporte R6 de {toast.patientDisplayName}. Categoría: {REPORT_REASON_LABELS[toast.reasonCategory]}.
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800">Conexiones activas</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {connections.length} chats
            </span>
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {connections.map((connection) => (
              <article key={connection.connectionId} className="grid gap-3 py-4 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-semibold text-slate-800">
                    {connection.patients.map((p) => p.displayName).join(" y ")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {connection.connectionType} · {connection.status}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-right text-sm">
                  <Metric label="Mensajes" value={connection.messageCount.toString()} />
                  <Metric label="Última actividad" value={connection.lastActivityAt ? new Date(connection.lastActivityAt).toLocaleDateString("es-CO") : "Sin actividad"} />
                  <Metric label="Reportes" value={connection.openReportsCount.toString()} tone={connection.openReportsCount > 0 ? "risk" : "ok"} />
                </div>
              </article>
            ))}
            {connections.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">No hay conversaciones activas.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800">Reportes abiertos</h2>
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
              {reports.length + badge}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {reports.map((report) => (
              <article key={report.reportId} className="rounded-lg border border-slate-200 p-3">
                <p className="font-semibold text-slate-800">{report.reportedPatient.displayName}</p>
                <p className="text-sm text-slate-600">
                  Reportado por {report.reporter.displayName} · {REPORT_REASON_LABELS[report.reason]}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  R6 alta · {new Date(report.triggeredAt).toLocaleString("es-CO")} · detalles: {report.hasDetails ? "sí" : "no"}
                </p>
              </article>
            ))}
            {reports.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">No hay reportes abiertos.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "risk";
}) {
  const color =
    tone === "risk"
      ? "text-estado-riesgo"
      : tone === "ok"
        ? "text-estado-ok"
        : "text-slate-800";
  return (
    <div>
      <p className={`font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
