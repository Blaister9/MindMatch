import type { ConnectionType, PublicCandidate } from "@mindmatch/shared";
import { AvatarInitials } from "./AvatarInitials";

const TYPE_LABELS: Record<ConnectionType, string> = {
  friendship: "Amistad",
  group: "Grupo",
  romantic: "Romántica",
};

export function CandidateCard({ candidate }: { candidate: PublicCandidate }) {
  const shared = new Set(candidate.sharedInterestSlugs);
  const pct = Math.round(candidate.compatibility * 100);
  return (
    <article className="rounded-card bg-white p-5 shadow-sm">
      <header className="flex items-center gap-4">
        <AvatarInitials name={candidate.displayName} avatarUrl={candidate.avatarUrl} size={64} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xl font-extrabold text-calma-600">
            {candidate.displayName}, {candidate.age}
          </h3>
          <p className="text-sm text-calma-600/70">{candidate.city}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-extrabold text-calma-600">{pct}%</div>
          <div className="text-xs text-calma-600/60">{TYPE_LABELS[candidate.suggestedConnectionType]}</div>
        </div>
      </header>

      <p className="mt-4 text-sm text-slate-700">{candidate.bio}</p>
      <p className="mt-2 text-sm text-slate-500">🎯 {candidate.goals}</p>

      {candidate.explanation && (
        <p className="mt-3 rounded-xl bg-calma-100 p-3 text-sm text-calma-600">
          {candidate.explanation}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {candidate.interests.map((interest) => {
          const isShared = shared.has(interest.slug);
          return (
            <span
              key={interest.id}
              className={`rounded-full px-3 py-1 text-sm ${
                isShared
                  ? "bg-calma-600 font-semibold text-white"
                  : "bg-cielo-200 text-slate-700"
              }`}
            >
              {isShared ? "★ " : ""}
              {interest.name}
            </span>
          );
        })}
      </div>
    </article>
  );
}
