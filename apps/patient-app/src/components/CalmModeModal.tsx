import { useEffect, useMemo, useRef, useState } from "react";
import {
  CALM_PHASE_LABELS,
  CALM_TOTAL_CYCLES,
  calmElapsed,
  calmFinish,
  calmInitial,
  calmIsComplete,
  calmPause,
  calmReset,
  calmResume,
  calmStart,
  calmView,
  type CalmMachineState,
} from "@mindmatch/shared";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CalmModeModal({ open, onClose }: Props) {
  const [state, setState] = useState<CalmMachineState>(() => calmInitial());
  const [now, setNow] = useState(() => performance.now());
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    setState((current) =>
      current.status === "idle" || current.status === "finished"
        ? calmStart(current, performance.now())
        : current,
    );
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = "";
      previousFocus.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || state.status !== "running") return;
    const tick = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(tick);
  }, [open, state.status]);

  useEffect(() => {
    if (!open || state.status !== "running") return;
    if (calmIsComplete(calmElapsed(state, now))) {
      setState((current) => calmFinish(current));
    }
  }, [open, state, now]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const elapsed = calmElapsed(state, now);
  const view = useMemo(() => calmView(elapsed), [elapsed]);
  const seconds = Math.ceil(view.phaseRemainingMs / 1000);
  const progress = 1 - view.phaseRemainingMs / view.phaseDurationMs;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calm-title"
    >
      <section className="w-full max-w-sm rounded-card bg-white p-6 text-center shadow-xl">
        <div
          className="mx-auto flex h-44 w-44 items-center justify-center rounded-full bg-calma-100 transition-transform duration-700 motion-reduce:transition-none"
          style={{ transform: `scale(${0.82 + progress * 0.22})` }}
        >
          <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-cielo-200 text-calma-600">
            <h2 id="calm-title" className="text-2xl font-extrabold">
              {CALM_PHASE_LABELS[view.phase]}
            </h2>
            <p className="text-4xl font-black">{seconds}</p>
          </div>
        </div>
        <p className="mt-5 text-sm font-semibold text-calma-600">
          Ciclo {view.cycle} de {CALM_TOTAL_CYCLES}
        </p>
        <p className="mt-1 text-sm text-calma-600/75">
          Respiración 4-7-8 para bajar el ritmo.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-2">
          {state.status === "running" ? (
            <button
              className="rounded-xl bg-calma-100 px-3 py-2 text-sm font-bold text-calma-600"
              onClick={() => setState((current) => calmPause(current, performance.now()))}
            >
              Pausar
            </button>
          ) : (
            <button
              className="rounded-xl bg-calma-100 px-3 py-2 text-sm font-bold text-calma-600"
              onClick={() => setState((current) => calmResume(current, performance.now()))}
            >
              Seguir
            </button>
          )}
          <button
            className="rounded-xl bg-cielo-200 px-3 py-2 text-sm font-bold text-slate-700"
            onClick={() => setState(calmStart(calmReset(), performance.now()))}
          >
            Reiniciar
          </button>
          <button
            ref={closeButtonRef}
            className="rounded-xl bg-calma-600 px-3 py-2 text-sm font-bold text-white"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </section>
    </div>
  );
}
