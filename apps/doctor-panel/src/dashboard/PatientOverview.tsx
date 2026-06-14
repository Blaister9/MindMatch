import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CreateMissionInput,
  Mission,
  PatientOverview as Overview,
} from "@mindmatch/shared";
import {
  cancelMission,
  createMission,
  fetchPatientOverview,
} from "../lib/api";
import { AvatarInitials } from "../components/AvatarInitials";
import { MissionsList } from "../missions/MissionsList";
import { MissionForm } from "../missions/MissionForm";
import { STATUS_COLOR_META, STATUS_HELP_TEXT, STATUS_REASON_TEXT } from "./statusRegistry";

export function PatientOverviewDrawer({
  token,
  patientUserId,
  onClose,
}: {
  token: string;
  patientUserId: string;
  onClose: () => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busyMissionId, setBusyMissionId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<Element | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setOverview(await fetchPatientOverview(token, patientUserId));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [token, patientUserId]);

  useEffect(() => {
    previousFocus.current = document.activeElement;
    void load();
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (previousFocus.current instanceof HTMLElement) previousFocus.current.focus();
    };
  }, [load, onClose]);

  async function handleCreate(input: CreateMissionInput) {
    try {
      await createMission(token, patientUserId, input);
      await load();
      return true;
    } catch {
      return false;
    }
  }

  async function handleCancel(missionId: string) {
    setBusyMissionId(missionId);
    try {
      await cancelMission(token, missionId);
      await load();
    } finally {
      setBusyMissionId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Detalle del paciente"
        tabIndex={-1}
        className="relative h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Detalle del paciente</h2>
          <button
            className="rounded-lg border px-3 py-1.5 text-sm"
            onClick={onClose}
            aria-label="Cerrar detalle"
          >
            Cerrar
          </button>
        </div>

        {status === "loading" && <p className="mt-6 text-slate-500">Cargando…</p>}
        {status === "error" && (
          <p className="mt-6 text-red-600">
            No se pudo cargar el detalle.{" "}
            <button className="underline" onClick={() => void load()}>
              Reintentar
            </button>
          </p>
        )}

        {status === "ready" && overview && (
          <div className="mt-4 space-y-6">
            <section className="flex items-center gap-3">
              <AvatarInitials name={overview.displayName} avatarUrl={overview.avatarUrl} size={56} />
              <div>
                <p className="font-semibold text-slate-800">{overview.displayName}</p>
                <p className="text-sm text-slate-500">{overview.city}</p>
                <span
                  className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR_META[overview.statusColor].chip}`}
                  title={STATUS_HELP_TEXT}
                >
                  {STATUS_COLOR_META[overview.statusColor].icon}{" "}
                  {STATUS_REASON_TEXT[overview.statusReason]}
                </span>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-700">Perfil social</h3>
              <p className="mt-1 text-sm text-slate-600">{overview.bio}</p>
              <p className="mt-1 text-sm text-slate-500">🎯 {overview.goals}</p>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-700">Conexiones</h3>
              {overview.connections.length === 0 ? (
                <p className="text-sm text-slate-500">Sin conexiones.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-sm text-slate-600">
                  {overview.connections.map((c) => (
                    <li key={c.connectionId}>
                      {c.otherDisplayName} · {c.connectionType} · {c.status}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-700">Pulso reciente</h3>
              <p className="mt-1 text-sm text-slate-600">
                {overview.pulsePoints
                  .map((p) => (p.mood == null ? "·" : String(p.mood)))
                  .join(" ")}
              </p>
              <p className="text-xs text-slate-400">Ánimo por día (· = sin check-in)</p>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-700">Alertas</h3>
              {overview.alerts.length === 0 ? (
                <p className="text-sm text-slate-500">Sin alertas.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-sm text-slate-600">
                  {overview.alerts.map((a) => (
                    <li key={a.alertId}>
                      {a.ruleCode} · {a.severity} · {a.status} ·{" "}
                      {new Date(a.triggeredAt).toLocaleDateString("es-CO")}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Misiones de bienestar</h3>
              <MissionsList
                missions={overview.missions as Mission[]}
                onCancel={(id) => void handleCancel(id)}
                busyId={busyMissionId}
              />
              <MissionForm onCreate={handleCreate} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
