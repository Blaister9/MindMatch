import { CONNECTION_TYPES } from "@mindmatch/shared";

const connectionLabels = {
  friendship: "amistad",
  group: "grupo",
  romantic: "romántica",
} as const;

export function App() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-calma-400 text-4xl shadow-lg shadow-calma-200">
        🧠
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold text-calma-600">MindMatch</h1>
        <p className="text-balance text-calma-600/80">
          Conexión social acompañada para tu bienestar.
        </p>
      </div>

      <div className="w-full rounded-card bg-white p-6 text-left shadow-sm">
        <p className="text-sm font-semibold text-calma-600">
          App del paciente · esqueleto Fase 0
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Aquí vivirán el perfil, el descubrimiento (swipe), el chat y el
          check-in diario.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {CONNECTION_TYPES.map((t) => (
            <span
              key={t}
              className="rounded-full bg-calma-100 px-3 py-1 text-xs font-semibold text-calma-600"
            >
              {connectionLabels[t]}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
