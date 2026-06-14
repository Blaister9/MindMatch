import type { Server, Socket } from "socket.io";
import type {
  ConversationActivity,
  MessageAck,
  PublicMessage,
  R6RealtimeEvent,
  Role,
  SimpleAck,
  TypingUpdate,
} from "@mindmatch/shared";

/** Contexto autenticado del socket (servidor). */
export interface SocketData {
  userId: string;
  clinicId: string;
  role: Role;
  email: string;
  /** epoch segundos de expiración del access token. */
  exp: number;
}

export interface ClientToServerEvents {
  "conversation:join": (payload: unknown, ack: (res: SimpleAck) => void) => void;
  "conversation:leave": (payload: unknown, ack: (res: SimpleAck) => void) => void;
  "message:send": (payload: unknown, ack: (res: MessageAck) => void) => void;
  "typing:start": (payload: unknown) => void;
  "typing:stop": (payload: unknown) => void;
}

export interface ServerToClientEvents {
  "message:new": (message: PublicMessage) => void;
  "typing:update": (update: TypingUpdate) => void;
  "conversation:activity": (activity: ConversationActivity) => void;
  "report:created": (event: R6RealtimeEvent) => void;
  "auth:expired": () => void;
}

export type InterServerEvents = Record<string, never>;

export type AppIoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
