import { z } from "zod";
import { connectionStatusSchema } from "./matching";
import { connectionTypeSchema } from "./connection";

// ── Enums espejo (contratos públicos) ────────────────────────────
export const conversationTypeSchema = z.enum(["direct", "group"]);
export type ConversationType = z.infer<typeof conversationTypeSchema>;

export const conversationStatusSchema = z.enum(["active", "paused", "closed"]);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

export const messageTypeSchema = z.enum(["text", "system"]);
export type MessageType = z.infer<typeof messageTypeSchema>;

export const messageReportStatusSchema = z.enum([
  "open",
  "reviewed",
  "dismissed",
  "actioned",
]);
export type MessageReportStatus = z.infer<typeof messageReportStatusSchema>;

export const reportReasonSchema = z.enum([
  "harassment",
  "inappropriate_content",
  "spam",
  "safety_concern",
  "other",
]);
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: "Acoso",
  inappropriate_content: "Contenido inapropiado",
  spam: "Spam o publicidad",
  safety_concern: "Preocupación por seguridad",
  other: "Otro",
};

export const socketErrorCodeSchema = z.enum([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "NOT_MEMBER",
  "CONVERSATION_INACTIVE",
  "NOT_JOINED",
  "RATE_LIMITED",
  "IDEMPOTENCY_CONFLICT",
  "INTERNAL",
]);
export type SocketErrorCode = z.infer<typeof socketErrorCodeSchema>;

// ── Conversaciones (lista, sin último body) ──────────────────────
export const publicConversationSchema = z.object({
  conversationId: z.string().uuid(),
  type: conversationTypeSchema,
  title: z.string().nullable(),
  status: conversationStatusSchema,
  otherDisplayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  memberCount: z.number().int(),
  lastActivityAt: z.string().nullable(),
});
export type PublicConversation = z.infer<typeof publicConversationSchema>;

export const conversationsResponseSchema = z.object({
  conversations: z.array(publicConversationSchema),
});
export type ConversationsResponse = z.infer<typeof conversationsResponseSchema>;

// ── Mensajes ─────────────────────────────────────────────────────
export const publicMessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderUserId: z.string().uuid(),
  senderDisplayName: z.string(),
  senderAvatarUrl: z.string().nullable(),
  messageType: messageTypeSchema,
  body: z.string(),
  sentAt: z.string(),
  editedAt: z.string().nullable(),
  clientMessageId: z.string().uuid().nullable(),
  isMine: z.boolean(),
});
export type PublicMessage = z.infer<typeof publicMessageSchema>;

export const messagesPageSchema = z.object({
  messages: z.array(publicMessageSchema),
  nextCursor: z.string().nullable(),
});
export type MessagesPage = z.infer<typeof messagesPageSchema>;

/** Contenido del cursor opaco (base64url de este objeto). */
export const messageCursorSchema = z
  .object({ sentAt: z.string().datetime({ offset: true }), id: z.string().uuid() })
  .strict();
export type MessageCursor = z.infer<typeof messageCursorSchema>;

// ── Inputs de socket (strict: rechazan claves inesperadas) ───────
export const conversationJoinSchema = z
  .object({ conversationId: z.string().uuid() })
  .strict();
export type ConversationJoinInput = z.infer<typeof conversationJoinSchema>;

export const conversationLeaveSchema = conversationJoinSchema;
export type ConversationLeaveInput = ConversationJoinInput;

export const messageSendInputSchema = z
  .object({
    conversationId: z.string().uuid(),
    clientMessageId: z.string().uuid(),
    body: z.string().trim().min(1).max(2000),
  })
  .strict();
export type MessageSendInput = z.infer<typeof messageSendInputSchema>;

export const typingInputSchema = z
  .object({ conversationId: z.string().uuid() })
  .strict();
export type TypingInput = z.infer<typeof typingInputSchema>;

// ── Acks y eventos servidor→cliente ──────────────────────────────
export const messageAckSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    status: z.enum(["created", "duplicate"]),
    message: publicMessageSchema,
  }),
  z.object({ ok: z.literal(false), code: socketErrorCodeSchema }),
]);
export type MessageAck = z.infer<typeof messageAckSchema>;

export const simpleAckSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), code: socketErrorCodeSchema }),
]);
export type SimpleAck = z.infer<typeof simpleAckSchema>;

export const typingUpdateSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
  displayName: z.string(),
  isTyping: z.boolean(),
});
export type TypingUpdate = z.infer<typeof typingUpdateSchema>;

/** Evento sin body para la sala personal (actividad de conversación). */
export const conversationActivitySchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  senderUserId: z.string().uuid(),
  sentAt: z.string(),
});
export type ConversationActivity = z.infer<typeof conversationActivitySchema>;

// ── Reportes (paciente) ──────────────────────────────────────────
export const reportInputSchema = z
  .object({
    reason: reportReasonSchema,
    details: z.string().trim().max(1000).optional(),
  })
  .strict();
export type ReportInput = z.infer<typeof reportInputSchema>;

/** Resultado para el paciente: NUNCA incluye alertId ni datos clínicos. */
export const reportResultSchema = z.object({
  reportId: z.string().uuid(),
  status: messageReportStatusSchema,
  createdAt: z.string(),
  outcome: z.enum(["created", "existing"]),
});
export type ReportResult = z.infer<typeof reportResultSchema>;

// ── Doctora: metadata (sin body) ─────────────────────────────────
export const doctorConnectionMetadataSchema = z.object({
  connectionId: z.string().uuid(),
  connectionType: connectionTypeSchema,
  status: connectionStatusSchema,
  patients: z
    .array(
      z.object({
        profileId: z.string().uuid(),
        displayName: z.string(),
        avatarUrl: z.string().nullable(),
      }),
    )
    .length(2),
  messageCount: z.number().int(),
  lastActivityAt: z.string().nullable(),
  openReportsCount: z.number().int(),
  lastReportAt: z.string().nullable(),
});
export type DoctorConnectionMetadata = z.infer<
  typeof doctorConnectionMetadataSchema
>;

export const doctorConnectionsMetadataResponseSchema = z.object({
  connections: z.array(doctorConnectionMetadataSchema),
});
export type DoctorConnectionsMetadataResponse = z.infer<
  typeof doctorConnectionsMetadataResponseSchema
>;

export const doctorReportSchema = z.object({
  reportId: z.string().uuid(),
  reason: reportReasonSchema,
  hasDetails: z.boolean(),
  reporter: z.object({
    userId: z.string().uuid(),
    displayName: z.string(),
  }),
  reportedPatient: z.object({
    userId: z.string().uuid(),
    displayName: z.string(),
  }),
  conversationId: z.string().uuid(),
  conversationType: conversationTypeSchema,
  groupTitle: z.string().nullable(),
  status: messageReportStatusSchema,
  createdAt: z.string(),
  alertId: z.string().uuid(),
  severity: z.literal("high"),
  triggeredAt: z.string(),
});
export type DoctorReport = z.infer<typeof doctorReportSchema>;

export const doctorReportsResponseSchema = z.object({
  reports: z.array(doctorReportSchema),
});
export type DoctorReportsResponse = z.infer<typeof doctorReportsResponseSchema>;

// ── Evento administrativo R6 (sala de doctoras) ──────────────────
export const r6RealtimeEventSchema = z.object({
  alertId: z.string().uuid(),
  reportId: z.string().uuid(),
  ruleCode: z.literal("R6"),
  severity: z.literal("high"),
  reportedUserId: z.string().uuid(),
  patientDisplayName: z.string(),
  reasonCategory: reportReasonSchema,
  conversationId: z.string().uuid(),
  conversationType: conversationTypeSchema,
  triggeredAt: z.string(),
});
export type R6RealtimeEvent = z.infer<typeof r6RealtimeEventSchema>;
