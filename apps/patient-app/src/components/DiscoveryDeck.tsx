import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicCandidate, SwipeDecision } from "@mindmatch/shared";
import { ApiError, fetchCandidates, sendSwipe } from "../lib/api";
import { CandidateCard } from "./CandidateCard";

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduce;
}

const THRESHOLD = 120;

export function DiscoveryDeck({ token }: { token: string }) {
  const [candidates, setCandidates] = useState<PublicCandidate[]>([]);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [feedback, setFeedback] = useState("");
  const [drag, setDrag] = useState(0);
  const [busy, setBusy] = useState(false);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const reduceMotion = usePrefersReducedMotion();

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await fetchCandidates(token);
      setCandidates(data.candidates);
      setIndex(0);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = candidates[index];

  const act = useCallback(
    async (decision: SwipeDecision) => {
      if (!current || busy) return;
      const target = current;
      setBusy(true);
      setDrag(0);
      try {
        const result = await sendSwipe(token, {
          targetProfileId: target.profileId,
          decision,
        });
        if (result.status === "matched") {
          setFeedback(
            `¡Conectaste con ${target.displayName}! Queda pendiente de aprobación de la doctora.`,
          );
        } else if (decision === "like") {
          setFeedback(`Le enviaste interés a ${target.displayName}.`);
        } else {
          setFeedback("");
        }
      } catch (error) {
        // 409 (ya decidido) o 404 (ya no disponible): continuar sin bloquear.
        if (!(error instanceof ApiError)) {
          setFeedback("No pudimos registrar tu decisión. Inténtalo de nuevo.");
        } else {
          setFeedback("");
        }
      } finally {
        setIndex((i) => i + 1);
        setBusy(false);
      }
    },
    [current, busy, token],
  );

  const onPointerDown = (event: React.PointerEvent) => {
    if (busy) return;
    draggingRef.current = true;
    startXRef.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!draggingRef.current) return;
    setDrag(event.clientX - startXRef.current);
  };
  const onPointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (drag > THRESHOLD) void act("like");
    else if (drag < -THRESHOLD) void act("pass");
    else setDrag(0);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "Enter") void act("like");
    else if (event.key === "ArrowLeft") void act("pass");
  };

  if (status === "loading") {
    return <p className="py-16 text-center text-calma-600/70">Cargando personas…</p>;
  }
  if (status === "error") {
    return (
      <div className="py-16 text-center">
        <p className="text-red-600">No pudimos cargar las sugerencias.</p>
        <button
          className="mt-3 rounded-xl border border-calma-200 px-4 py-2 text-sm text-calma-600"
          onClick={() => void load()}
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <section aria-label="Descubrir personas">
      <div aria-live="polite" className="min-h-6 text-center text-sm text-calma-600">
        {feedback}
      </div>

      {current ? (
        <>
          <div
            role="group"
            aria-label={`Tarjeta de ${current.displayName}`}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="cursor-grab touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-calma-600"
            style={{
              transform: `translateX(${drag}px) rotate(${drag * 0.04}deg)`,
              transition:
                draggingRef.current || reduceMotion ? "none" : "transform 0.2s ease",
            }}
          >
            <CandidateCard candidate={current} />
          </div>

          <div className="mt-5 flex justify-center gap-4">
            <button
              className="rounded-full bg-white px-6 py-3 font-bold text-slate-600 shadow disabled:opacity-50"
              onClick={() => void act("pass")}
              disabled={busy}
              aria-label={`Pasar a ${current.displayName}`}
            >
              Pasar
            </button>
            <button
              className="rounded-full bg-calma-600 px-6 py-3 font-bold text-white shadow disabled:opacity-50"
              onClick={() => void act("like")}
              disabled={busy}
              aria-label={`Me interesa ${current.displayName}`}
            >
              Me interesa
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-calma-600/50">
            Desliza, usa los botones o las flechas del teclado (← pasar, → me interesa).
          </p>
        </>
      ) : (
        <div className="py-16 text-center">
          <p className="text-calma-600/80">Por ahora no hay más personas para mostrar.</p>
          <button
            className="mt-3 rounded-xl border border-calma-200 px-4 py-2 text-sm text-calma-600"
            onClick={() => void load()}
          >
            Actualizar
          </button>
        </div>
      )}
    </section>
  );
}
