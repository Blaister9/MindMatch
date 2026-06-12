const estados = [
  { label: "Estable", color: "var(--color-estado-ok)" },
  { label: "Atención", color: "var(--color-estado-alerta)" },
  { label: "Riesgo", color: "var(--color-estado-riesgo)" },
];

export function App() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-8 py-4">
        <h1 className="text-lg font-bold text-brand-600">
          MindMatch · Panel de la doctora
        </h1>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-10">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-500">
            Esqueleto Fase 0
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-800">
            Sala de control
          </h2>
          <p className="mt-2 max-w-prose text-slate-500">
            Aquí vivirán el resumen de pacientes con semáforo de estado, las
            alertas del Pulso Emocional, los matches pendientes de aprobar y la
            analítica de la clínica.
          </p>

          <div className="mt-6 flex gap-3">
            {estados.map((e) => (
              <span
                key={e.label}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm font-medium text-slate-600"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: e.color }}
                />
                {e.label}
              </span>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
