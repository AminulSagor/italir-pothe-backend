import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';

@Injectable()
export class SessionSocketRegistryService {
  private readonly sessionSockets = new Map<string, Map<string, Socket>>();

  register(sessionId: string, socket: Socket): void {
    const sockets =
      this.sessionSockets.get(sessionId) ?? new Map<string, Socket>();

    sockets.set(socket.id, socket);
    this.sessionSockets.set(sessionId, sockets);
  }

  unregister(sessionId: string, socketId: string): void {
    const sockets = this.sessionSockets.get(sessionId);

    if (!sockets) {
      return;
    }

    sockets.delete(socketId);

    if (sockets.size === 0) {
      this.sessionSockets.delete(sessionId);
    }
  }

  disconnectSession(sessionId: string): void {
    const sockets = this.sessionSockets.get(sessionId);

    if (!sockets) {
      return;
    }

    for (const socket of sockets.values()) {
      socket.disconnect(true);
    }

    this.sessionSockets.delete(sessionId);
  }
}
