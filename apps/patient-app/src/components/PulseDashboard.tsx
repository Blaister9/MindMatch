import { useEffect, useState } from "react";
import type { PulseHistoryPoint, PulseTodayResponse } from "@mindmatch/shared";
import {
  fetchPulseHistory,
  fetchPulsePreferences,
  fetchPulseToday,
  savePulsePreferences,
  savePulseToday,
} from "../lib/api";

function MoodChart({ points }: { points: PulseHistoryPoint[] }) {
  const valid = points.filter((point) => point.mood !== null);
  const path = valid
    .map((point, index) => {
      const x = valid.length <= 1 ? 0 : (index / (valid.length - 1)) * 100;
      const y = 100 - (((point.mood ?? 1) - 1) / 4) * 100;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div>
      <svg viewBox="0 0 100 100" className="h-28 w-full" role="img" aria-label="Grafica de animo">
        <path d="M 0 100 H 100" stroke="#dbe7e1" strokeWidth="1" />
        {path && <path d={path} fill="none" stroke="#45806c" strokeWidth="4" strokeLinecap="round" />}
      </svg>
      <p className="text-xs text-calma-600/70">
        {valid.length} registros en el rango. Animo de 1 a 5.
      </p>
    </div>
  );
}

export function PulseDashboard({ token }: { token: string }) {
  const [today, setToday] = useState<PulseTodayResponse | null>(null);
  const [history, setHistory] = useState<PulseHistoryPoint[]>([]);
  const [days, setDays] = useState<7 | 30>(7);
  const [form, setForm] = useState({ mood: 3, sleep: 3, connectedWithSomeone: true });
  const [pref, setPref] = useState({ enabled: true, localTime: "08:00" });
  const [message, setMessage] = useState("");

  async function load(nextDays = days) {
    const [todayData, historyData, prefData] = await Promise.all([
      fetchPulseToday(token),
      fetchPulseHistory(token, nextDays),
      fetchPulsePreferences(token),
    ]);
    setToday(todayData);
    setHistory(historyData.points);
    setPref({ enabled: prefData.enabled, localTime: prefData.localTime });
    if (todayData.checkIn) {
      setForm({
        mood: todayData.checkIn.mood,
        sleep: todayData.checkIn.sleep,
        connectedWithSomeone: todayData.checkIn.connectedWithSomeone,
      });
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await savePulseToday(token, form);
    setMessage("Check-in guardado.");
    await load();
  }

  async function savePref() {
    await savePulsePreferences(token, pref);
    setMessage("Horario actualizado.");
    await load();
  }

  return (
    <section className="space-y-4">
      <div className="rounded-card bg-white p-5 shadow-sm">
        <p className="text-sm font-bold text-calma-600">Pulso de hoy</p>
        <p className="mt-1 text-sm text-calma-600/70">
          {today?.today} · {today?.completed ? "completado" : "pendiente"}
        </p>
        <form className="mt-4 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-semibold text-calma-600">
            Animo: {form.mood}
            <input className="mt-2 w-full" type="range" min="1" max="5" value={form.mood} onChange={(event) => setForm({ ...form, mood: Number(event.target.value) })} />
          </label>
          <label className="block text-sm font-semibold text-calma-600">
            Sueno: {form.sleep}
            <input className="mt-2 w-full" type="range" min="1" max="5" value={form.sleep} onChange={(event) => setForm({ ...form, sleep: Number(event.target.value) })} />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-calma-600">
            <input type="checkbox" checked={form.connectedWithSomeone} onChange={(event) => setForm({ ...form, connectedWithSomeone: event.target.checked })} />
            Hoy conecte con alguien
          </label>
          <button className="w-full rounded-xl bg-calma-600 px-4 py-3 font-bold text-white">
            Guardar check-in
          </button>
        </form>
      </div>

      <div className="rounded-card bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-calma-600">Historial</p>
          <select
            className="rounded-xl border border-calma-200 px-3 py-2 text-sm"
            value={days}
            onChange={(event) => {
              const next = Number(event.target.value) as 7 | 30;
              setDays(next);
              void load(next);
            }}
          >
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
          </select>
        </div>
        <MoodChart points={history} />
      </div>

      <div className="rounded-card bg-white p-5 shadow-sm">
        <p className="text-sm font-bold text-calma-600">Recordatorio</p>
        <div className="mt-3 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-calma-600">
            <input type="checkbox" checked={pref.enabled} onChange={(event) => setPref({ ...pref, enabled: event.target.checked })} />
            Activo
          </label>
          <input className="field" type="time" value={pref.localTime} onChange={(event) => setPref({ ...pref, localTime: event.target.value })} />
        </div>
        <button className="mt-3 rounded-xl border border-calma-200 px-4 py-2 text-sm font-bold text-calma-600" onClick={() => void savePref()}>
          Guardar horario
        </button>
      </div>
      {message && <p className="text-sm text-calma-600">{message}</p>}
    </section>
  );
}
