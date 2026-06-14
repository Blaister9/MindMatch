import { useCallback, useEffect, useState } from "react";
import type { Mission, MissionStatus } from "@mindmatch/shared";
import { completeMission, fetchMissions } from "../lib/api";

const STATUS_LABEL: Record<MissionStatus, string> = {
  assigned: "Pendiente",
  completed: "Completada",
  expired: "Vencida",
  cancelled: "Cancelada",
};

function MissionCard({
  mission,
  onComplete,
  busy,
}: {
  mission: Mission;
  onComplete: () => void;
  busy: boolean;
}) {
  const label = mission.overdue ? "Vencida" : STATUS_LABEL[mission.status];
  return (
    <li className="rounded-card bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-calma-600">{mission.title}</p>
          <p className="text-sm text-slate-600">{mission.description}</p>
          <p className="mt-1 text-xs text-calma-600/60">
            {label}
            {mission.dueDate &&
              ` · para el ${new Date(`${mission.dueDate}T12:00:00-05:00`).toLocaleDateString("es-CO")}`}
          </p>
        </div>
        {mission.status === "assigned" && (
          <button
            type="button"
            className="rounded-xl bg-calma-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={onComplete}
          >
            Completar
          </button>
        )}
      </div>
    </li>
  );
}

export function MissionsList({ token }: { token: string }) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await fetchMissions(token);
      setMissions(data.missions);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleComplete(missionId: string) {
    setBusyId(missionId);
    try {
      await completeMission(token, missionId);
      await load();
    } finally {
      setBusyId(null);
      setConfirmingId(null);
    }
  }

  if (status === "loading") {
    return <p className="py-10 text-center text-calma-600/70">Cargando tus misiones…</p>;
  }
  if (status === "error") {
    return (
      <div className="py-10 text-center">
        <p className="text-red-600">No pudimos cargar tus misiones.</p>
        <button className="mt-3 rounded-xl border border-calma-200 px-4 py-2 text-sm text-calma-600" onClick={() => void load()}>
          Reintentar
        </button>
      </div>
    );
  }
  if (missions.length === 0) {
    return (
      <p className="py-10 text-center text-calma-600/80">
        Aún no tienes misiones de bienestar. Tu doctora puede asignarte una.
      </p>
    );
  }

  const pending = missions.filter((m) => m.status === "assigned");
  const done = missions.filter((m) => m.status !== "assigned");

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-lg font-extrabold text-calma-600">Pendientes</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-calma-600/70">Sin misiones pendientes.</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((m) => (
              <div key={m.id}>
                <MissionCard
                  mission={m}
                  busy={busyId === m.id}
                  onComplete={() => setConfirmingId(m.id)}
                />
                {confirmingId === m.id && (
                  <div className="mt-1 flex items-center gap-2 rounded-xl bg-calma-100 p-3 text-sm">
                    <span className="text-calma-600">¿Marcar como completada?</span>
                    <button
                      className="rounded-lg bg-calma-600 px-3 py-1 font-semibold text-white disabled:opacity-50"
                      disabled={busyId === m.id}
                      onClick={() => void handleComplete(m.id)}
                    >
                      Sí, completar
                    </button>
                    <button className="rounded-lg border px-3 py-1" onClick={() => setConfirmingId(null)}>
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-extrabold text-calma-600">Historial</h2>
          <ul className="space-y-3">
            {done.map((m) => (
              <MissionCard key={m.id} mission={m} busy={false} onComplete={() => {}} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
