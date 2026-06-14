/** Nombres de sala tenant-scoped. Se construyen SOLO en el servidor. */
export function conversationRoom(clinicId: string, conversationId: string): string {
  return `clinic:${clinicId}:conversation:${conversationId}`;
}

export function doctorsRoom(clinicId: string): string {
  return `clinic:${clinicId}:doctors`;
}

export function userRoom(clinicId: string, userId: string): string {
  return `clinic:${clinicId}:user:${userId}`;
}
