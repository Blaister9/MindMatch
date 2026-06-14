import { RESOURCES } from "@mindmatch/shared";

export function ResourcesPanel({ onClose }: { onClose: () => void }) {
  return (
    <section className="rounded-card bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-calma-600">Recursos</h2>
        <button className="rounded-xl border border-calma-200 px-3 py-2 text-sm text-calma-600" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {RESOURCES.map((resource) => (
          <article key={resource.id} className="rounded-2xl bg-calma-50 p-3">
            <h3 className="font-bold text-calma-600">{resource.title}</h3>
            <p className="mt-1 text-sm text-calma-600/75">{resource.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
