import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  MessageAck,
  PublicConversation,
  PublicMessage,
  ReportReason,
  SimpleAck,
  TypingUpdate,
} from "@mindmatch/shared";
import { REPORT_REASON_LABELS } from "@mindmatch/shared";
import { fetchConversations, fetchMessages, reportMessage } from "../lib/api";
import { CalmModeModal } from "./CalmModeModal";
import { ResourcesPanel } from "./ResourcesPanel";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

interface PendingMessage extends PublicMessage {
  pending?: boolean;
  failed?: boolean;
}

const REASONS = Object.keys(REPORT_REASON_LABELS) as ReportReason[];

export function ChatWorkspace({
  token,
  userId,
}: {
  token: string;
  userId: string;
}) {
  const [conversations, setConversations] = useState<PublicConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, PendingMessage[]>>({});
  const [cursorByConversation, setCursorByConversation] = useState<Record<string, string | null>>({});
  const [draft, setDraft] = useState("");
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [typing, setTyping] = useState<Record<string, TypingUpdate[]>>({});
  const [reporting, setReporting] = useState<PublicMessage | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("safety_concern");
  const [reportDetails, setReportDetails] = useState("");
  const [notice, setNotice] = useState("");
  const [showCalm, setShowCalm] = useState(false);
  const [showResources, setShowResources] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const typingTimer = useRef<number | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const activeConversation = conversations.find((c) => c.conversationId === activeId) ?? null;
  const messages = activeId ? messagesByConversation[activeId] ?? [] : [];

  const mergeMessages = useCallback((conversationId: string, nextMessages: PendingMessage[]) => {
    setMessagesByConversation((current) => {
      const existing = current[conversationId] ?? [];
      const byKey = new Map<string, PendingMessage>();
      for (const message of [...existing, ...nextMessages]) {
        byKey.set(message.clientMessageId ?? message.id, { ...byKey.get(message.clientMessageId ?? message.id), ...message });
      }
      const merged = [...byKey.values()].sort(
        (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime() || a.id.localeCompare(b.id),
      );
      return { ...current, [conversationId]: merged };
    });
  }, []);

  const loadConversations = useCallback(async () => {
    const data = await fetchConversations(token);
    setConversations(data.conversations);
    setActiveId((current) => current ?? data.conversations[0]?.conversationId ?? null);
  }, [token]);

  const loadPage = useCallback(async (conversationId: string, cursor?: string | null) => {
    const page = await fetchMessages(token, conversationId, cursor);
    mergeMessages(conversationId, page.messages);
    setCursorByConversation((current) => ({ ...current, [conversationId]: page.nextCursor }));
  }, [mergeMessages, token]);

  useEffect(() => {
    void loadConversations().catch(() => setNotice("No pudimos cargar tus conversaciones."));
  }, [loadConversations]);

  useEffect(() => {
    activeIdRef.current = activeId;
    if (!activeId) return;
    void loadPage(activeId).catch(() => setNotice("No pudimos cargar el historial."));
  }, [activeId, loadPage]);

  useEffect(() => {
    const socket = io(API_URL, {
      path: "/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    socket.on("connect", () => setConnectionState("connected"));
    socket.io.on("reconnect_attempt", () => setConnectionState("reconnecting"));
    socket.on("disconnect", () => setConnectionState("disconnected"));
    socket.on("connect_error", () => setConnectionState("disconnected"));
    socket.on("auth:expired", () => setNotice("Tu sesión expiró. Vuelve a iniciar sesión."));
    socket.on("message:new", (message: PublicMessage) => {
      mergeMessages(message.conversationId, [{ ...message, isMine: message.senderUserId === userId }]);
    });
    socket.on("typing:update", (update: TypingUpdate) => {
      setTyping((current) => {
        const list = current[update.conversationId] ?? [];
        const next = update.isTyping
          ? [...list.filter((item) => item.userId !== update.userId), update]
          : list.filter((item) => item.userId !== update.userId);
        return { ...current, [update.conversationId]: next };
      });
    });
    socket.on("conversation:activity", () => void loadConversations());
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [loadConversations, mergeMessages, token, userId]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !activeId) return;
    socket.emit("conversation:join", { conversationId: activeId }, (ack: SimpleAck) => {
      if (!ack.ok) setNotice("Esta conversación no está disponible.");
    });
    return () => {
      socket.emit("typing:stop", { conversationId: activeId });
      socket.emit("conversation:leave", { conversationId: activeId }, () => undefined);
    };
  }, [activeId]);

  const activeTyping = useMemo(
    () => (activeId ? (typing[activeId] ?? []).filter((item) => item.userId !== userId) : []),
    [activeId, typing, userId],
  );

  function sendTyping() {
    if (!activeId) return;
    socketRef.current?.emit("typing:start", { conversationId: activeId });
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      socketRef.current?.emit("typing:stop", { conversationId: activeIdRef.current });
    }, 2500);
  }

  function sendMessage(clientMessageId?: string, bodyOverride?: string) {
    if (!activeId) return;
    const body = (bodyOverride ?? draft).trim();
    if (!body) return;
    const id = clientMessageId ?? crypto.randomUUID();
    const optimistic: PendingMessage = {
      id,
      conversationId: activeId,
      senderUserId: userId,
      senderDisplayName: "Tú",
      senderAvatarUrl: null,
      messageType: "text",
      body,
      sentAt: new Date().toISOString(),
      editedAt: null,
      clientMessageId: id,
      isMine: true,
      pending: true,
    };
    mergeMessages(activeId, [optimistic]);
    setDraft("");
    socketRef.current?.emit(
      "message:send",
      { conversationId: activeId, clientMessageId: id, body },
      (ack: MessageAck) => {
        if (!ack.ok) {
          mergeMessages(activeId, [{ ...optimistic, pending: false, failed: true }]);
          setNotice(ack.code === "IDEMPOTENCY_CONFLICT" ? "Ese envío cambió y no se pudo reintentar." : "No se pudo enviar el mensaje.");
          return;
        }
        mergeMessages(activeId, [{ ...ack.message, isMine: true, pending: false, failed: false }]);
      },
    );
  }

  async function submitReport() {
    if (!reporting) return;
    try {
      const result = await reportMessage(token, reporting.id, {
        reason: reportReason,
        details: reportDetails || undefined,
      });
      setNotice(result.outcome === "existing" ? "Este reporte ya estaba registrado." : "Reporte enviado a tu doctora.");
      setReporting(null);
      setReportDetails("");
    } catch {
      setNotice("No se pudo registrar el reporte.");
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2 rounded-card bg-white p-3 shadow-sm">
        <span className="text-sm font-bold text-calma-600">
          {connectionState === "connected" ? "Conectada" : connectionState === "reconnecting" ? "Reconectando" : connectionState === "connecting" ? "Conectando" : "Sin conexión"}
        </span>
        <div className="flex gap-2">
          <button className="rounded-xl bg-calma-100 px-3 py-2 text-sm font-bold text-calma-600" onClick={() => setShowResources((v) => !v)}>
            Recursos
          </button>
          <button className="rounded-xl bg-cielo-200 px-3 py-2 text-sm font-bold text-slate-700" onClick={() => setShowCalm(true)}>
            Modo Calma
          </button>
        </div>
      </div>
      {showResources && <ResourcesPanel onClose={() => setShowResources(false)} />}
      <div className="grid gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {conversations.map((conversation) => (
            <button
              key={conversation.conversationId}
              className={`shrink-0 rounded-2xl px-3 py-2 text-sm font-bold ${activeId === conversation.conversationId ? "bg-calma-600 text-white" : "bg-white text-calma-600"}`}
              onClick={() => setActiveId(conversation.conversationId)}
            >
              {conversation.type === "group" ? conversation.title : conversation.otherDisplayName}
            </button>
          ))}
        </div>
        {activeConversation ? (
          <article className="rounded-card bg-white p-4 shadow-sm">
            <header className="border-b border-calma-100 pb-3">
              <h2 className="font-extrabold text-calma-600">
                {activeConversation.type === "group" ? activeConversation.title : activeConversation.otherDisplayName}
              </h2>
              <p className="text-xs text-calma-600/60">{activeConversation.memberCount} integrantes</p>
            </header>
            <div className="mt-3 flex max-h-[52vh] min-h-80 flex-col gap-2 overflow-y-auto pr-1">
              {cursorByConversation[activeConversation.conversationId] && (
                <button className="mx-auto rounded-xl border border-calma-200 px-3 py-2 text-sm text-calma-600" onClick={() => void loadPage(activeConversation.conversationId, cursorByConversation[activeConversation.conversationId])}>
                  Cargar anteriores
                </button>
              )}
              {messages.map((message) => (
                <div key={message.clientMessageId ?? message.id} className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${message.isMine ? "ml-auto bg-calma-600 text-white" : "bg-calma-100 text-slate-700"}`}>
                  {!message.isMine && <p className="mb-1 text-xs font-bold text-calma-600">{message.senderDisplayName}</p>}
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <div className="mt-1 flex items-center justify-between gap-3 text-[11px] opacity-75">
                    <span>{message.pending ? "Enviando" : message.failed ? "No enviado" : new Date(message.sentAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span>
                    {!message.isMine && (
                      <button className="font-bold underline" onClick={() => setReporting(message)}>
                        Reportar
                      </button>
                    )}
                    {message.failed && (
                      <button className="font-bold underline" onClick={() => sendMessage(message.clientMessageId ?? undefined, message.body)}>
                        Reintentar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 min-h-5 text-xs text-calma-600/70">
              {activeTyping.length ? `${activeTyping.map((t) => t.displayName).join(", ")} está escribiendo` : ""}
            </p>
            <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
              <input
                className="field"
                value={draft}
                maxLength={2000}
                onChange={(event) => { setDraft(event.target.value); sendTyping(); }}
                placeholder="Escribe un mensaje"
              />
              <button className="rounded-xl bg-calma-600 px-4 py-2 font-bold text-white">
                Enviar
              </button>
            </form>
          </article>
        ) : (
          <p className="py-12 text-center text-calma-600/80">No hay chats activos todavía.</p>
        )}
      </div>
      {notice && <p className="rounded-2xl bg-white p-3 text-sm text-calma-600 shadow-sm">{notice}</p>}
      {reporting && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-5">
          <section className="w-full max-w-sm rounded-card bg-white p-5 shadow-xl">
            <h2 className="text-lg font-extrabold text-calma-600">Reportar mensaje</h2>
            <select className="field mt-4" value={reportReason} onChange={(event) => setReportReason(event.target.value as ReportReason)}>
              {REASONS.map((reason) => (
                <option key={reason} value={reason}>{REPORT_REASON_LABELS[reason]}</option>
              ))}
            </select>
            <textarea className="field mt-3 min-h-24" maxLength={1000} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} placeholder="Detalles opcionales" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="rounded-xl border border-calma-200 px-3 py-2 text-calma-600" onClick={() => setReporting(null)}>
                Cancelar
              </button>
              <button className="rounded-xl bg-calma-600 px-3 py-2 font-bold text-white" onClick={() => void submitReport()}>
                Enviar
              </button>
            </div>
          </section>
        </div>
      )}
      <CalmModeModal open={showCalm} onClose={() => setShowCalm(false)} />
    </section>
  );
}
