import { messageCursorSchema, type MessageCursor } from "@mindmatch/shared";

/** Cursor opaco: base64url de { sentAt, id } validado con Zod. Sin secretos. */
export function encodeCursor(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): MessageCursor | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = messageCursorSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
