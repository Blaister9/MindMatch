/** Registro de timers de "escribiendo" con expiración automática en servidor. */
export const TYPING_MAX_MS = 4000;

class TypingRegistry {
  private timers = new Map<string, Map<string, NodeJS.Timeout>>();

  /** Inicia/reinicia el timer; al vencer invoca onExpire (emite isTyping:false). */
  start(socketId: string, conversationId: string, onExpire: () => void): void {
    let perSocket = this.timers.get(socketId);
    if (!perSocket) {
      perSocket = new Map();
      this.timers.set(socketId, perSocket);
    }
    const existing = perSocket.get(conversationId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      const map = this.timers.get(socketId);
      map?.delete(conversationId);
      if (map && map.size === 0) this.timers.delete(socketId);
      onExpire();
    }, TYPING_MAX_MS);
    // No mantener el proceso vivo solo por este timer.
    if (typeof timer.unref === "function") timer.unref();
    perSocket.set(conversationId, timer);
  }

  /** Detiene un timer; devuelve true si existía (para emitir false una vez). */
  stop(socketId: string, conversationId: string): boolean {
    const perSocket = this.timers.get(socketId);
    const timer = perSocket?.get(conversationId);
    if (!timer || !perSocket) return false;
    clearTimeout(timer);
    perSocket.delete(conversationId);
    if (perSocket.size === 0) this.timers.delete(socketId);
    return true;
  }

  /** Limpia todos los timers del socket; devuelve las conversaciones afectadas. */
  clearSocket(socketId: string): string[] {
    const perSocket = this.timers.get(socketId);
    if (!perSocket) return [];
    const conversationIds = [...perSocket.keys()];
    for (const timer of perSocket.values()) clearTimeout(timer);
    this.timers.delete(socketId);
    return conversationIds;
  }

  clearAll(): void {
    for (const perSocket of this.timers.values()) {
      for (const timer of perSocket.values()) clearTimeout(timer);
    }
    this.timers.clear();
  }
}

export const typingRegistry = new TypingRegistry();
