import { useState } from "react";
import { createMissionInputSchema, type CreateMissionInput } from "@mindmatch/shared";

/** Sugerencias seguras (no prescriptivas). */
const SUGGESTIONS = [
  "Dar una caminata corta",
  "Escribirle a alguien de confianza",
  "Reservar diez minutos para una actividad tranquila",
];

export function MissionForm({
  onCreate,
}: {
  onCreate: (input: CreateMissionInput) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const input = {
      title: title.trim(),
      description: description.trim(),
      ...(dueDate ? { dueDate } : {}),
    };
    const parsed = createMissionInputSchema.safeParse(input);
    if (!parsed.success) {
      setError("Revisa título (3–160) y descripción (3–1000).");
      return;
    }
    setBusy(true);
    const ok = await onCreate(parsed.data);
    setBusy(false);
    if (ok) {
      setTitle("");
      setDescription("");
      setDueDate("");
    } else {
      setError("No se pudo crear la misión.");
    }
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <p className="text-sm font-semibold text-slate-700">Asignar misión de bienestar</p>
      <input
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        placeholder="Título"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        list="mission-suggestions"
      />
      <datalist id="mission-suggestions">
        {SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <textarea
        className="min-h-16 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        placeholder="Descripción breve (no es una prescripción médica)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <label className="block text-xs text-slate-500">
        Fecha límite (opcional)
        <input
          type="date"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </label>
      <button
        type="submit"
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        disabled={busy}
      >
        Asignar misión
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
