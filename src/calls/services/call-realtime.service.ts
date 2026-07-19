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

  /**
   * Disconnect only the banned user's currently connected
   * call sockets.
   *
   * Existing call behavior for every other user remains unchanged.
   */
  disconnectUserForModeration(
    userId: string,
    payload: Record<string, unknown>,
  ): boolean {
    if (!this.server) {
      return false;
    }

    const socketIds = Array.from(this.userSockets.get(userId) ?? []);

    if (socketIds.length === 0) {
      return false;
    }

    /*
     * Emit the restriction event first so the client has a brief
     * opportunity to receive the reason before its call socket closes.
     *
     * The chat socket and FCM notification remain the primary mobile
     * navigation mechanisms for showing the suspended-account screen.
     */
    this.server.to(this.userRoom(userId)).emit('account_banned', payload);

    setTimeout(() => {
      for (const socketId of socketIds) {
        /*
         * Disconnect only sockets registered for this banned user.
         * No other user's socket or room is affected.
         */
        const socket = this.server?.sockets.sockets.get(socketId);

        socket?.disconnect(true);

        /*
         * Socket.IO normally triggers handleDisconnect(), which calls
         * unregister(). Calling it here as well safely handles stale
         * socket records. The method is idempotent.
         */
        this.unregister(socketId);
      }
    }, 250);

    return true;
  }

  emitToUser(userId: string, event: string, payload: unknown): boolean {
    if (!this.server || !this.isUserConnected(userId)) {
      return false;
    }

    this.server.to(this.userRoom(userId)).emit(event, payload);

    return true;
  }
}
