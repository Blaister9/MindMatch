import { useCallback, useEffect, useState } from "react";
import type {
  ConnectionStatus,
  ConnectionType,
  PatientConnection,
} from "@mindmatch/shared";
import { fetchConnections } from "../lib/api";
import { AvatarInitials } from "./AvatarInitials";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  pending_approval: "Pendiente de aprobación",
  approved: "Aprobada",
  active: "Activa",
  paused: "En pausa",
  rejected: "No aprobada",
  closed: "Cerrada",
};

const TYPE_LABELS: Record<ConnectionType, string> = {
  friendship: "Amistad",
  group: "Grupo",
  romantic: "Romántica",
};

export function ConnectionsList({ token }: { token: string }) {
  const [connections, setConnections] = useState<PatientConnection[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await fetchConnections(token);
      setConnections(data.connections);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "loading") {
    return <p className="py-12 text-center text-calma-600/70">Cargando tus conexiones…</p>;
  }
  if (status === "error") {
    return (
      <div className="py-12 text-center">
        <p className="text-red-600">No pudimos cargar tus conexiones.</p>
        <button
          className="mt-3 rounded-xl border border-calma-200 px-4 py-2 text-sm text-calma-600"
          onClick={() => void load()}
        >
          Reintentar
        </button>
      </div>
    );
  }
  if (connections.length === 0) {
    return (
      <p className="py-12 text-center text-calma-600/80">
        Aún no tienes conexiones. Cuando alguien que te interesa también te elija,
        aparecerá aquí.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {connections.map((connection) => (
        <li
          key={connection.connectionId}
          className="flex items-center gap-3 rounded-card bg-white p-4 shadow-sm"
        >
          <AvatarInitials
            name={connection.other.displayName}
            avatarUrl={connection.other.avatarUrl}
            size={48}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-calma-600">
              {connection.other.displayName}, {connection.other.age}
            </p>
            <p className="text-sm text-calma-600/70">{connection.other.city}</p>
          </div>
          <div className="text-right">
            <span className="block text-sm font-semibold text-calma-600">
              {STATUS_LABELS[connection.status]}
            </span>
            <span className="text-xs text-calma-600/60">
              {TYPE_LABELS[connection.connectionType]}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
