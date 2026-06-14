import type { Mission, MissionStatus } from "@mindmatch/shared";

const STATUS_LABEL: Record<MissionStatus, string> = {
  assigned: "Asignada",
  completed: "Completada",
  expired: "Vencida",
  cancelled: "Cancelada",
};

export function MissionsList({
  missions,
  onCancel,
  busyId,
}: {
  missions: Mission[];
  onCancel?: (missionId: string) => void;
  busyId?: string | null;
}) {
  if (missions.length === 0) {
    return <p className="text-sm text-slate-500">Sin misiones asignadas.</p>;
  }
  return (
    <ul className="space-y-2">
      {missions.map((mission) => (
        <li key={mission.id} className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-slate-800">{mission.title}</p>
              <p className="text-sm text-slate-500">{mission.description}</p>
              <p className="mt-1 text-xs text-slate-400">
                {STATUS_LABEL[mission.status]}
                {mission.overdue && " · Vencida"}
                {mission.dueDate &&
                  ` · vence ${new Date(`${mission.dueDate}T12:00:00-05:00`).toLocaleDateString("es-CO")}`}
              </p>
            </div>
            {onCancel && mission.status === "assigned" && (
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-50"
                disabled={busyId === mission.id}
                onClick={() => onCancel(mission.id)}
              >
                Cancelar
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
