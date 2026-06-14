import type { ReactNode } from "react";

export function ChartShell({
  title,
  description,
  status,
  empty,
  emptyHint,
  children,
}: {
  title: string;
  description: string;
  status: "loading" | "ready" | "error";
  empty?: boolean;
  emptyHint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-base font-bold text-slate-800">{title}</h3>
      <p className="mb-3 text-sm text-slate-500">{description}</p>
      {status === "loading" && <p className="text-slate-500">Cargando…</p>}
      {status === "error" && <p className="text-red-600">No se pudo cargar.</p>}
      {status === "ready" && empty && (
        <p className="text-slate-500">{emptyHint ?? "Sin datos para mostrar."}</p>
      )}
      {status === "ready" && !empty && children}
    </section>
  );
}
