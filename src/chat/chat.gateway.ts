import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';

import { PresenceService } from '../presence/presence.service';
import { UserBlocksService } from '../user-blocks/user-blocks.service';
import { User } from '../users/entities/user.entity';
import { ChatService } from './chat.service';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Conversation } from './entities/conversation.entity';
import { DirectConversation } from './entities/direct-conversation.entity';
import {
  NotificationPriority,
  NotificationType,
} from '../notifications/entities/notification-event.entity';
import { NotificationsService } from '../notifications/services/notifications.service';
import { UserDeviceService } from 'src/devices/services/user-device.service';
import { SessionSocketRegistryService } from 'src/auth/session-socket-registry.service';

interface SocketJwtPayload {
  sub?: string;
  id?: string;
  sid?: string;
  did?: string;
}

@WebSocketGateway({
  namespace: 'chat',
  cors: true,
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  /**
   * Tracks all active socket connections for each user.
   *
   * userId -> socket IDs
   */
  private readonly connections = new Map<string, Set<string>>();

  /**
   * Tracks users actively viewing a specific conversation inbox.
   *
   * conversationId -> set of userIds
   */
  private readonly activeInboxUsers = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
    private readonly userBlocksService: UserBlocksService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,

    @InjectRepository(DirectConversation)
    private readonly directConversationRepo: Repository<DirectConversation>,

    @InjectRepository(ConversationParticipant)
    private readonly participantRepo: Repository<ConversationParticipant>,

    private readonly presenceService: PresenceService,
    private readonly notificationsService: NotificationsService,
    private readonly userDeviceService: UserDeviceService,
    private readonly sessionSocketRegistry: SessionSocketRegistryService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      let token = client.handshake.auth?.token ?? client.handshake.query?.token;

      if (!token) {
        this.logger.warn('Connection without token, disconnecting');
        client.disconnect(true);
        return;
      }

      if (typeof token === 'string' && token.startsWith('Bearer ')) {
        token = token.slice(7);
      }

      if (typeof token !== 'string') {
        this.logger.warn('Invalid socket token, disconnecting');
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify<SocketJwtPayload>(token);

      const userId = payload.sub ?? payload.id;

      const sessionId = payload.sid?.trim();

      const deviceId = payload.did?.trim();

      if (!userId || !sessionId || !deviceId) {
        this.logger.warn(
          'Socket JWT does not contain user, session, or device information',
        );

        client.disconnect(true);
        return;
      }

      /*
       * Check PostgreSQL to confirm that logout has not
       * revoked this authentication session.
       */
      await this.userDeviceService.assertAuthSessionActive({
        userId,
        sessionId,
        deviceId,
      });

      const user = await this.userRepo.findOne({
        where: {
          id: userId,
        },
      });

      if (!user || user.isBanned) {
        client.disconnect(true);
        return;
      }

      client.data.user = user;
      client.data.authSessionId = sessionId;
      client.data.deviceId = deviceId;

      this.sessionSocketRegistry.register(sessionId, client);

      const userConnections =
        this.connections.get(user.id) ?? new Set<string>();

      userConnections.add(client.id);
      this.connections.set(user.id, userConnections);

      await this.presenceService.handleSocketConnect(user.id, client.id);

      // Join the user's private Socket.IO room.
      await client.join(this.userRoom(user.id));

      // Broadcast online presence only for the user's first active socket.
      if (userConnections.size === 1) {
        this.server.emit('user_presence_change', {
          userId: user.id,
          isOnline: true,
        });
      }

      this.logger.log(`User ${user.id} connected (socket=${client.id})`);
    } catch (error) {
      this.logger.warn(
        'Auth failed for socket connection',
        error instanceof Error ? error.message : String(error),
      );

      client.disconnect(true);
    }
  }

  disconnectUserForModeration(
    userId: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.server) {
      return;
    }

    const room = this.userRoom(userId);

    /*
     * Notify only the banned user's connected chat sockets.
     */
    this.server.to(room).emit('account_banned', payload);

    /*
     * Allow Flutter a brief moment to process the event and
     * open the suspended-account screen before disconnecting.
     */
    setTimeout(() => {
      this.server.in(room).disconnectSockets(true);
    }, 250);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const sessionId = client.data.authSessionId as string | undefined;

    if (sessionId) {
      this.sessionSocketRegistry.unregister(sessionId, client.id);
    }

    const user = client.data.user as User | undefined;

    if (!user) {
      return;
    }

    const userConnections = this.connections.get(user.id);

    if (userConnections) {
      userConnections.delete(client.id);

      if (userConnections.size === 0) {
        this.connections.delete(user.id);

        this.server.emit('user_presence_change', {
          userId: user.id,
          isOnline: false,
        });
      }
    }

    for (const [conversationId, userSet] of this.activeInboxUsers.entries()) {
      if (userSet.has(user.id)) {
        userSet.delete(user.id);
        if (userSet.size === 0) {
          this.activeInboxUsers.delete(conversationId);
        }
      }
    }

    await this.presenceService.handleSocketDisconnect(user.id, client.id);

    this.logger.log(`User ${user.id} disconnected (socket=${client.id})`);
  }

  private conversationRoom(conversationId: string): string {
    return `conversation:${conversationId}`;
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  /**
   * Sends an event to every connected socket belonging to a user.
   *
   * Returns true when the user currently has at least one connected socket.
   */
  sendToUser(userId: string, event: string, payload: unknown): boolean {
    const room = this.userRoom(userId);

    this.server.to(room).emit(event, payload);

    const adapter =
      (this.server as any).adapter ?? (this.server as any).sockets?.adapter;

    const sockets = adapter?.rooms?.get(room);
    const isOnline = Boolean(sockets && sockets.size > 0);

    this.logger.log(
      `sendToUser: Emitted ${event} to room ${room}. ` +
        `Detected online status: ${isOnline}`,
    );

    return isOnline;
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    client: Socket,
    payload: {
      conversationId: string;
    },
  ) {
    const user = client.data.user as User | undefined;

    if (!user) {
      return { error: 'Unauthorized' };
    }

    const room = this.conversationRoom(payload.conversationId);

    await client.join(room);

    this.logger.log(
      `User ${user.id} joined conversation ${payload.conversationId}`,
    );

    return { ok: true };
  }

  @SubscribeMessage('leave_conversation')
  async handleLeaveConversation(
    client: Socket,
    payload: {
      conversationId: string;
    },
  ) {
    const user = client.data.user as User | undefined;

    if (!user) {
      return { error: 'Unauthorized' };
    }

    const room = this.conversationRoom(payload.conversationId);

    await client.leave(room);

    this.logger.log(
      `User ${user.id} left conversation ${payload.conversationId}`,
    );

    return { ok: true };
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    client: Socket,
    payload: {
      conversationId: string;
      content?: string | null;
      clientMessageId?: string | null;
      messageType?: string;
      attachments?: Array<{
        fileUrl: string;
        fileName?: string;
        mimeType?: string;
        fileSizeBytes?: string;
        attachmentType?: string;
      }>;
    },
  ) {
    const user = client.data.user as User | undefined;

    if (!user) {
      return { error: 'Unauthorized' };
    }

    const conversation = await this.conversationRepo.findOne({
      where: {
        id: payload.conversationId,
      },
    });

    /*
     * For direct conversations, verify that neither user has blocked
     * the other before allowing the message.
     */
    if (conversation?.type === 'direct') {
      const directConversation = await this.directConversationRepo.findOne({
        where: {
          conversationId: payload.conversationId,
        },
      });

      if (directConversation) {
        const otherUserId =
          directConversation.userOneId === user.id
            ? directConversation.userTwoId
            : directConversation.userOneId;

        try {
          await this.userBlocksService.assertCanMessage(user.id, otherUserId);
        } catch (error) {
          return {
            error:
              error instanceof Error ? error.message : 'Cannot send message',
          };
        }
      }
    }

    const savedMessage = await this.chatService.createMessage({
      conversationId: payload.conversationId,
      senderId: user.id,
      clientMessageId: payload.clientMessageId ?? null,
      content: payload.content ?? null,
      messageType: payload.messageType,
      attachments: payload.attachments as any,
    });

    const room = this.conversationRoom(payload.conversationId);

    try {
      const adapter =
        (this.server as any).adapter ?? (this.server as any).sockets?.adapter;

      const roomSockets = adapter?.rooms?.get(room);

      this.logger.log(
        `Broadcasting message ${savedMessage.id} to room ${room}`,
      );

      this.logger.log(`Room ${room} has ${roomSockets?.size ?? 0} socket(s)`);

      if (roomSockets && roomSockets.size > 0) {
        this.logger.log(
          `Sockets in room: ${Array.from(roomSockets).join(', ')}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        'Failed to read room sockets for debugging',
        error instanceof Error ? error.message : String(error),
      );
    }

    // Broadcast the message to users currently viewing the conversation.
    this.server.to(room).emit('message', savedMessage);

    const participantIds = await this.chatService.getConversationParticipantIds(
      payload.conversationId,
    );

    const receiverIds = participantIds.filter(
      (participantId) => participantId !== user.id,
    );

    if (receiverIds.length > 0) {
      await this.chatService.createDeliveryJobs({
        messageId: savedMessage.id,
        conversationId: payload.conversationId,
        receiverIds,
      });

      for (const receiverId of receiverIds) {
        this.sendToUser(receiverId, 'receive_message', savedMessage);

        this.sendToUser(receiverId, 'new_message', savedMessage);

        const inboxUsers = this.activeInboxUsers.get(payload.conversationId);
        const isInInbox = inboxUsers?.has(receiverId) ?? false;

        if (!isInInbox) {
          try {
            const senderName = user.name || user.fullName || 'Someone';
            const bodyText =
              savedMessage.content ||
              (payload.attachments?.length
                ? 'Sent an attachment'
                : 'New message');

            await this.notificationsService.createSystemNotificationForUser({
              userId: receiverId,
              type: NotificationType.ADMIN_MESSAGE,
              title: senderName.slice(0, 180),
              body: bodyText.slice(0, 500),
              deepLink:
                `/messages?conversationId=${encodeURIComponent(payload.conversationId)}` +
                `&senderId=${encodeURIComponent(user.id)}`,
              priority: NotificationPriority.HIGH,
            });
          } catch (error) {
            this.logger.warn(
              `Failed to create message notification for ${receiverId}`,
              error instanceof Error ? error.message : String(error),
            );
          }
        }

        try {
          await this.participantRepo.increment(
            {
              conversationId: payload.conversationId,
              userId: receiverId,
            },
            'unreadCount',
            1,
          );

          const participant = await this.participantRepo.findOne({
            where: {
              conversationId: payload.conversationId,
              userId: receiverId,
            },
          });

          const isHighlighted = Boolean(
            (participant?.lastReadSequenceNo ?? 0) < savedMessage.sequenceNo &&
            savedMessage.senderId !== receiverId,
          );

          this.sendToUser(receiverId, 'conversation:unread', {
            conversationId: payload.conversationId,
            unreadCount: participant?.unreadCount ?? 0,
            isHighlighted,
          });
        } catch (error) {
          this.logger.warn(
            `Failed to update unread count for receiver ${receiverId}`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }

    return {
      ok: true,
      messageId: savedMessage.id,
    };
  }

  @SubscribeMessage('presence:enter_inbox')
  async handleEnterInbox(client: Socket, payload: { conversationId: string }) {
    const user = client.data.user as User | undefined;
    if (!user || !payload?.conversationId) {
      return { error: 'Unauthorized or invalid payload' };
    }

    const conversationUsers =
      this.activeInboxUsers.get(payload.conversationId) ?? new Set<string>();
    conversationUsers.add(user.id);
    this.activeInboxUsers.set(payload.conversationId, conversationUsers);

    this.logger.log(
      `User ${user.id} entered inbox for conversation ${payload.conversationId}`,
    );
    return { ok: true };
  }

  @SubscribeMessage('presence:leave_inbox')
  async handleLeaveInbox(client: Socket, payload: { conversationId: string }) {
    const user = client.data.user as User | undefined;
    if (!user || !payload?.conversationId) {
      return { error: 'Unauthorized or invalid payload' };
    }

    const conversationUsers = this.activeInboxUsers.get(payload.conversationId);
    if (conversationUsers) {
      conversationUsers.delete(user.id);
      if (conversationUsers.size === 0) {
        this.activeInboxUsers.delete(payload.conversationId);
      }
    }

    this.logger.log(
      `User ${user.id} left inbox for conversation ${payload.conversationId}`,
    );
    return { ok: true };
  }

  @SubscribeMessage('presence:heartbeat')
  async handlePresenceHeartbeat(client: Socket) {
    const user = client.data.user as User | undefined;

    if (!user) {
      return { error: 'Unauthorized' };
    }

    try {
      return await this.presenceService.heartbeat(user.id);
    } catch (error) {
      this.logger.warn(
        `Presence heartbeat failed for ${user.id}`,
        error instanceof Error ? error.message : String(error),
      );

      return {
        error: 'Failed to refresh presence',
      };
    }
  }
}
