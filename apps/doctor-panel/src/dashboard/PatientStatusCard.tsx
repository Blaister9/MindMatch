import type { PatientCard } from "@mindmatch/shared";
import { AvatarInitials } from "../components/AvatarInitials";
import { STATUS_COLOR_META, STATUS_REASON_TEXT } from "./statusRegistry";

export function PatientStatusCard({
  patient,
  onOpen,
}: {
  patient: PatientCard;
  onOpen: () => void;
}) {
  const meta = STATUS_COLOR_META[patient.statusColor];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
    >
      <div className="flex items-center gap-3">
        <AvatarInitials name={patient.displayName} avatarUrl={patient.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-800">{patient.displayName}</p>
          <p className="text-sm text-slate-500">{patient.city}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.chip}`}
        >
          <span aria-hidden="true">{meta.icon}</span>
          {meta.label}
        </span>
      </div>
      <p className="text-xs text-slate-500">{STATUS_REASON_TEXT[patient.statusReason]}</p>
      <dl className="grid grid-cols-4 gap-2 text-center text-xs text-slate-600">
        <div>
          <dt className="text-slate-400">Último</dt>
          <dd className="font-semibold">
            {patient.lastCheckInDate
              ? new Date(`${patient.lastCheckInDate}T12:00:00-05:00`).toLocaleDateString("es-CO", {
                  day: "2-digit",
                  month: "2-digit",
                })
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Alertas</dt>
          <dd className="font-semibold">{patient.openAlertsCount}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Conex.</dt>
          <dd className="font-semibold">{patient.activeConnectionsCount}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Misiones</dt>
          <dd className="font-semibold">{patient.pendingMissionsCount}</dd>
        </div>
      </dl>
    </button>
  );
}
