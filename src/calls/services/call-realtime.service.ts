import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class CallRealtimeService {
  private server: Server | null = null;

  /**
   * userId -> connected call socket IDs
   */
  private readonly userSockets = new Map<string, Set<string>>();

  /**
   * socketId -> userId
   */
  private readonly socketUsers = new Map<string, string>();

  setServer(server: Server): void {
    this.server = server;
  }

  userRoom(userId: string): string {
    return `user:${userId}`;
  }

  register(userId: string, socketId: string): void {
    const sockets = this.userSockets.get(userId) ?? new Set<string>();

    sockets.add(socketId);

    this.userSockets.set(userId, sockets);
    this.socketUsers.set(socketId, userId);
  }

  unregister(socketId: string): string | null {
    const userId = this.socketUsers.get(socketId);

    if (!userId) {
      return null;
    }

    this.socketUsers.delete(socketId);

    const sockets = this.userSockets.get(userId);

    if (sockets) {
      sockets.delete(socketId);

      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }

    return userId;
  }

  isUserConnected(userId: string): boolean {
    return (this.userSockets.get(userId)?.size ?? 0) > 0;
  }

  emitToUser(userId: string, event: string, payload: unknown): boolean {
    if (!this.server || !this.isUserConnected(userId)) {
      return false;
    }

    this.server.to(this.userRoom(userId)).emit(event, payload);

    return true;
  }
}
