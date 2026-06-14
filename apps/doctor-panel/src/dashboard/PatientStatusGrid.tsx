import { useCallback, useEffect, useState } from "react";
import type { PatientCard } from "@mindmatch/shared";
import { fetchPatientCards } from "../lib/api";
import { PatientStatusCard } from "./PatientStatusCard";
import { PatientOverviewDrawer } from "./PatientOverview";
import { STATUS_HELP_TEXT } from "./statusRegistry";

export function PatientStatusGrid({ token }: { token: string }) {
  const [patients, setPatients] = useState<PatientCard[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await fetchPatientCards(token);
      setPatients(data.patients);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-label="Pacientes" className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-slate-700">Pacientes</h3>
        <button className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => void load()}>
          Actualizar
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-400">{STATUS_HELP_TEXT}</p>

      {status === "loading" && <p className="text-slate-500">Cargando pacientes…</p>}
      {status === "error" && (
        <p className="text-red-600">
          No se pudieron cargar los pacientes.{" "}
          <button className="underline" onClick={() => void load()}>
            Reintentar
          </button>
        </p>
      )}
      {status === "ready" && patients.length === 0 && (
        <p className="text-slate-500">No hay pacientes activos.</p>
      )}
      {status === "ready" && patients.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {patients.map((patient) => (
            <PatientStatusCard
              key={patient.patientUserId}
              patient={patient}
              onOpen={() => setSelected(patient.patientUserId)}
            />
          ))}
        </div>
      )}

      {selected && (
        <PatientOverviewDrawer
          token={token}
          patientUserId={selected}
          onClose={() => {
            setSelected(null);
            void load();
          }}
        />
      )}
    </section>
  );
}
