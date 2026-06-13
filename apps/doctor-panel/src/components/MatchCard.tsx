import type {
  ConnectionType,
  DoctorPendingMatch,
  MatchPatient,
} from "@mindmatch/shared";
import { AvatarInitials } from "./AvatarInitials";

const TYPE_LABELS: Record<ConnectionType, string> = {
  friendship: "Amistad",
  group: "Grupo",
  romantic: "Romántica",
};

function PatientSummary({ patient }: { patient: MatchPatient }) {
  return (
    <div className="flex items-center gap-3">
      <AvatarInitials name={patient.displayName} avatarUrl={patient.avatarUrl} />
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-800">
          {patient.displayName}, {patient.age}
        </p>
        <p className="text-sm text-slate-500">{patient.city}</p>
      </div>
    </div>
  );
}

interface Props {
  match: DoctorPendingMatch;
  busy: boolean;
  onApprove: () => void;
  onPause: () => void;
}

export function MatchCard({ match, busy, onApprove, onPause }: Props) {
  const [first, second] = match.patients;
  if (!first || !second) return null;
  const pct =
    match.compatibility === null ? null : Math.round(match.compatibility * 100);
  const sharedNames = first.interests
    .filter((i) => match.sharedInterestSlugs.includes(i.slug))
    .map((i) => i.name);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <PatientSummary patient={first} />
        <span className="text-slate-300">↔</span>
        <PatientSummary patient={second} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold text-slate-700">
          {TYPE_LABELS[match.connectionType]}
        </span>
        {pct === null ? (
          <span className="rounded bg-red-100 px-2 py-0.5 text-red-700">
            ⚠ Sin score (revisar datos)
          </span>
        ) : (
          <span className="text-slate-600">Compatibilidad {pct}%</span>
        )}
        <span className="text-slate-400">
          {new Date(match.matchedAt).toLocaleDateString("es-CO")}
        </span>
      </div>

      {match.explanation && (
        <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          {match.explanation}
        </p>
      )}

      {sharedNames.length > 0 && (
        <p className="mt-2 text-sm text-slate-500">
          Intereses en común: {sharedNames.join(", ")}
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <button
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          onClick={onApprove}
          disabled={busy}
        >
          Aprobar
        </button>
        <button
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
          onClick={onPause}
          disabled={busy}
        >
          Pausar
        </button>
      </div>
    </article>
  );
}
