import { useCallback, useEffect, useState } from "react";
import type { DoctorPendingMatch } from "@mindmatch/shared";
import {
  approveMatch,
  fetchPendingMatches,
  pauseMatch,
} from "../lib/api";
import { MatchCard } from "./MatchCard";

export function PendingMatches({ token }: { token: string }) {
  const [matches, setMatches] = useState<DoctorPendingMatch[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await fetchPendingMatches(token);
      setMatches(data.matches);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    async (connectionId: string, action: "approve" | "pause") => {
      setBusyId(connectionId);
      setNotice("");
      try {
        if (action === "approve") await approveMatch(token, connectionId);
        else await pauseMatch(token, connectionId);
        setNotice(
          action === "approve"
            ? "Match aprobado: se creó la conversación."
            : "Match pausado.",
        );
        await load();
      } catch {
        setNotice("No se pudo completar la acción.");
      } finally {
        setBusyId(null);
      }
    },
    [token, load],
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">
          Matches pendientes
          {matches.length > 0 && (
            <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-sm text-white">
              {matches.length}
            </span>
          )}
        </h2>
        <button
          className="rounded-lg border px-3 py-1.5 text-sm"
          onClick={() => void load()}
        >
          Actualizar
        </button>
      </div>

      {notice && <p className="mt-3 text-sm text-brand-600">{notice}</p>}

      {status === "loading" && (
        <p className="mt-4 text-slate-500">Cargando matches…</p>
      )}
      {status === "error" && (
        <p className="mt-4 text-red-600">No se pudieron cargar los matches.</p>
      )}
      {status === "ready" && matches.length === 0 && (
        <p className="mt-4 text-slate-500">No hay matches pendientes por ahora.</p>
      )}

      <div className="mt-4 space-y-4">
        {matches.map((match) => (
          <MatchCard
            key={match.connectionId}
            match={match}
            busy={busyId === match.connectionId}
            onApprove={() => void decide(match.connectionId, "approve")}
            onPause={() => void decide(match.connectionId, "pause")}
          />
        ))}
      </div>
    </section>
  );
}
