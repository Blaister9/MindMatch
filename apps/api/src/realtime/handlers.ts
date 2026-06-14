import {
  conversationJoinSchema,
  conversationLeaveSchema,
  messageSendInputSchema,
  typingInputSchema,
  type MessageAck,
  type SimpleAck,
  type SocketErrorCode,
} from "@mindmatch/shared";
import { db } from "../db";
import {
  activeMemberUserIds,
  loadConversationAccess,
  loadSenderProfiles,
  type ConversationAccessFailure,
} from "../services/conversation-access";
import { sendMessage, toPublicMessage } from "../services/message-service";
import type { AppIoServer, AppSocket } from "./events";
import { allowMessage, allowTyping, MAX_ROOMS_PER_SOCKET } from "./rate-limit";
import { conversationRoom, doctorsRoom, userRoom } from "./rooms";
import { typingRegistry } from "./typing";

const expiryTimers = new Map<string, NodeJS.Timeout>();
const displayNameCache = new Map<string, string>();

export function clearAllExpiryTimers(): void {
  for (const timer of expiryTimers.values()) clearTimeout(timer);
  expiryTimers.clear();
}

function ackWith<T>(ack: ((res: T) => void) | undefined, res: T): void {
  if (typeof ack === "function") ack(res);
}

function mapFailure(reason: ConversationAccessFailure): SocketErrorCode {
  if (reason === "not_found") return "NOT_FOUND";
  if (reason === "not_member") return "NOT_MEMBER";
  return "CONVERSATION_INACTIVE";
}

async function resolveDisplayName(clinicId: string, userId: string): Promise<string> {
  const key = `${clinicId}:${userId}`;
  const cached = displayNameCache.get(key);
  if (cached) return cached;
  const profiles = await loadSenderProfiles(db, clinicId, [userId]);
  const name = profiles.get(userId)?.displayName ?? "Usuario";
  displayNameCache.set(key, name);
  return name;
}

export function registerSocketHandlers(io: AppIoServer, socket: AppSocket): void {
  const { userId, clinicId, role, exp } = socket.data;

  // Auto-join: doctora a la sala admin; paciente a su sala personal.
  if (role === "doctor") {
    void socket.join(doctorsRoom(clinicId));
  } else {
    void socket.join(userRoom(clinicId, userId));
  }

  // Timer de expiración del access token.
  const msUntilExp = exp * 1000 - Date.now();
  if (msUntilExp <= 0) {
    socket.emit("auth:expired");
    socket.disconnect(true);
    return;
  }
  const expiryTimer = setTimeout(() => {
    socket.emit("auth:expired");
    socket.disconnect(true);
  }, msUntilExp);
  if (typeof expiryTimer.unref === "function") expiryTimer.unref();
  expiryTimers.set(socket.id, expiryTimer);

  socket.on("conversation:join", (payload, ack) => {
    void handleJoin(io, socket, payload, ack);
  });
  socket.on("conversation:leave", (payload, ack) => {
    void handleLeave(io, socket, payload, ack);
  });
  socket.on("message:send", (payload, ack) => {
    void handleSend(io, socket, payload, ack);
  });
  socket.on("typing:start", (payload) => {
    void handleTyping(io, socket, payload, true);
  });
  socket.on("typing:stop", (payload) => {
    void handleTyping(io, socket, payload, false);
  });

  socket.on("disconnect", () => {
    const timer = expiryTimers.get(socket.id);
    if (timer) clearTimeout(timer);
    expiryTimers.delete(socket.id);
    for (const conversationId of typingRegistry.clearSocket(socket.id)) {
      io.to(conversationRoom(clinicId, conversationId)).emit("typing:update", {
        conversationId,
        userId,
        displayName: "",
        isTyping: false,
      });
    }
  });
}

async function handleJoin(
  io: AppIoServer,
  socket: AppSocket,
  payload: unknown,
  ack: (res: SimpleAck) => void,
): Promise<void> {
  const parsed = conversationJoinSchema.safeParse(payload);
  if (!parsed.success) return ackWith(ack, { ok: false, code: "VALIDATION_ERROR" });
  if (socket.data.role !== "patient") {
    return ackWith(ack, { ok: false, code: "FORBIDDEN" });
  }
  const joinedConversationRooms = [...socket.rooms].filter((r) =>
    r.includes(":conversation:"),
  );
  if (joinedConversationRooms.length >= MAX_ROOMS_PER_SOCKET) {
    return ackWith(ack, { ok: false, code: "RATE_LIMITED" });
  }
  const access = await loadConversationAccess(
    db,
    socket.data.clinicId,
    socket.data.userId,
    parsed.data.conversationId,
    { allowedStatuses: ["active"], verifySubResources: true },
  );
  if (!access.ok) return ackWith(ack, { ok: false, code: mapFailure(access.reason) });
  await socket.join(conversationRoom(socket.data.clinicId, parsed.data.conversationId));
  return ackWith(ack, { ok: true });
}

async function handleLeave(
  io: AppIoServer,
  socket: AppSocket,
  payload: unknown,
  ack: (res: SimpleAck) => void,
): Promise<void> {
  const parsed = conversationLeaveSchema.safeParse(payload);
  if (!parsed.success) return ackWith(ack, { ok: false, code: "VALIDATION_ERROR" });
  const { clinicId, userId } = socket.data;
  const room = conversationRoom(clinicId, parsed.data.conversationId);
  await socket.leave(room);
  if (typingRegistry.stop(socket.id, parsed.data.conversationId)) {
    socket.to(room).emit("typing:update", {
      conversationId: parsed.data.conversationId,
      userId,
      displayName: "",
      isTyping: false,
    });
  }
  return ackWith(ack, { ok: true });
}

async function handleSend(
  io: AppIoServer,
  socket: AppSocket,
  payload: unknown,
  ack: (res: MessageAck) => void,
): Promise<void> {
  const parsed = messageSendInputSchema.safeParse(payload);
  if (!parsed.success) return ackWith(ack, { ok: false, code: "VALIDATION_ERROR" });
  if (socket.data.role !== "patient") {
    return ackWith(ack, { ok: false, code: "FORBIDDEN" });
  }
  const { clinicId, userId } = socket.data;
  const { conversationId, clientMessageId, body } = parsed.data;
  const room = conversationRoom(clinicId, conversationId);

  if (!socket.rooms.has(room)) {
    return ackWith(ack, { ok: false, code: "NOT_JOINED" });
  }
  if (!allowMessage(userId)) {
    return ackWith(ack, { ok: false, code: "RATE_LIMITED" });
  }

  const access = await loadConversationAccess(db, clinicId, userId, conversationId, {
    allowedStatuses: ["active"],
    verifySubResources: true,
  });
  if (!access.ok) return ackWith(ack, { ok: false, code: mapFailure(access.reason) });

  const outcome = await sendMessage(clinicId, userId, conversationId, clientMessageId, body);
  if (outcome.status === "conflict") {
    return ackWith(ack, { ok: false, code: "IDEMPOTENCY_CONFLICT" });
  }

  ackWith(ack, {
    ok: true,
    status: outcome.status,
    message: toPublicMessage(outcome.data, userId),
  });

  if (outcome.status === "created") {
    io.to(room).emit("message:new", toPublicMessage(outcome.data, ""));
    const members = await activeMemberUserIds(db, clinicId, conversationId);
    for (const memberId of members) {
      io.to(userRoom(clinicId, memberId)).emit("conversation:activity", {
        conversationId,
        messageId: outcome.data.id,
        senderUserId: userId,
        sentAt: outcome.data.sentAt,
      });
    }
  }
}

async function handleTyping(
  io: AppIoServer,
  socket: AppSocket,
  payload: unknown,
  isStart: boolean,
): Promise<void> {
  const parsed = typingInputSchema.safeParse(payload);
  if (!parsed.success || socket.data.role !== "patient") return;
  const { clinicId, userId } = socket.data;
  const { conversationId } = parsed.data;
  const room = conversationRoom(clinicId, conversationId);
  if (!socket.rooms.has(room)) return;

  if (!isStart) {
    if (typingRegistry.stop(socket.id, conversationId)) {
      socket.to(room).emit("typing:update", {
        conversationId,
        userId,
        displayName: "",
        isTyping: false,
      });
    }
    return;
  }

  if (!allowTyping(`${socket.id}:${conversationId}`)) return;
  const displayName = await resolveDisplayName(clinicId, userId);
  socket.to(room).emit("typing:update", { conversationId, userId, displayName, isTyping: true });
  typingRegistry.start(socket.id, conversationId, () => {
    io.to(room).emit("typing:update", {
      conversationId,
      userId,
      displayName: "",
      isTyping: false,
    });
  });
}
