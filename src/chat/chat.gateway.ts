import {
  SubscribeMessage,
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { ChatService } from './chat.service';
import { UserBlocksService } from '../user-blocks/user-blocks.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Conversation } from './entities/conversation.entity';
import { DirectConversation } from './entities/direct-conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { PresenceService } from '../presence/presence.service';

@WebSocketGateway({ namespace: 'chat', cors: true })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  // userId -> set of socket ids
  private readonly connections = new Map<string, Set<string>>();

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
  ) {}

  async handleConnection(client: Socket) {
    try {
      let token = (client.handshake.auth && client.handshake.auth.token) || client.handshake.query?.token;

      if (!token) {
        this.logger.warn('Connection without token, disconnecting');
        client.disconnect(true);
        return;
      }

      if (typeof token === 'string' && token.startsWith('Bearer ')) {
        token = token.slice(7);
      }

      const payload = this.jwtService.verify(token as string);
      const userId = payload.sub as string;

      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) {
        client.disconnect(true);
        return;
      }

      client.data.user = user;

      // track connection
      const set = this.connections.get(user.id) ?? new Set<string>();
      set.add(client.id);
      this.connections.set(user.id, set);

      await this.presenceService.handleSocketConnect(user.id, client.id);

      // join personal room
      client.join(this.userRoom(user.id));

      // Broadcast presence change
      if (set.size === 1) { // They just came online
        this.server.emit('user_presence_change', { userId: user.id, isOnline: true });
      }

      this.logger.log(`User ${user.id} connected (socket=${client.id})`);
    } catch (err) {
      this.logger.warn('Auth failed for socket connection', err?.message ?? err);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const user: User | undefined = client.data.user;
    if (user) {
      const set = this.connections.get(user.id);
      if (set) {
        set.delete(client.id);
        if (set.size === 0) {
          this.connections.delete(user.id);
          this.server.emit('user_presence_change', { userId: user.id, isOnline: false });
        }
      }
      await this.presenceService.handleSocketDisconnect(user.id, client.id);
      this.logger.log(`User ${user.id} disconnected (socket=${client.id})`);
    }
  }

  private conversationRoom(conversationId: string) {
    return `conversation:${conversationId}`;
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  // Send directly to a user's personal room. Returns true if sent to at least one socket.
  sendToUser(userId: string, event: string, payload: any): boolean {
    const room = this.userRoom(userId);
    
    // Always emit the event to ensure Socket.IO delivers it to any connected sockets
    this.server.to(room).emit(event, payload);

    // Retrieve adapter status for delivery/online confirmation
    const adapter = (this.server as any).adapter || (this.server as any).sockets?.adapter;
    const sockets = adapter?.rooms?.get(room);
    const isOnline = !!(sockets && sockets.size > 0);

    this.logger.log(`sendToUser: Emitted ${event} to room ${room}. Detected online status: ${isOnline}`);
    return isOnline;
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(client: Socket, payload: { conversationId: string }) {
    const user: User = client.data.user;
    if (!user) return { error: 'Unauthorized' };

    const room = this.conversationRoom(payload.conversationId);
    client.join(room);
    this.logger.log(`User ${user.id} joined conversation ${payload.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('leave_conversation')
  async handleLeaveConversation(client: Socket, payload: { conversationId: string }) {
    const user: User = client.data.user;
    if (!user) return { error: 'Unauthorized' };

    const room = this.conversationRoom(payload.conversationId);
    client.leave(room);
    this.logger.log(`User ${user.id} left conversation ${payload.conversationId}`);
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
      attachments?: Array<{ fileUrl: string; fileName?: string; mimeType?: string; fileSizeBytes?: string; attachmentType?: string }>;
    },
  ) {
    const user: User = client.data.user;
    if (!user) return { error: 'Unauthorized' };

    // Check if this is a direct conversation and validate block status
    const conversation = await this.conversationRepo.findOne({
      where: { id: payload.conversationId },
    });

    if (conversation && conversation.type === 'direct') {
      const directConv = await this.directConversationRepo.findOne({
        where: { conversationId: payload.conversationId },
      });

      if (directConv) {
        // Get the other user in the direct conversation
        const otherUserId =
          directConv.userOneId === user.id ? directConv.userTwoId : directConv.userOneId;

        try {
          await this.userBlocksService.assertCanMessage(user.id, otherUserId);
        } catch (error) {
          return { error: error.message || 'Cannot send message' };
        }
      }
    }

    const saved = await this.chatService.createMessage({
      conversationId: payload.conversationId,
      senderId: user.id,
      clientMessageId: payload.clientMessageId ?? null,
      content: payload.content ?? null,
      messageType: payload.messageType,
      attachments: payload.attachments as any,
    });

    // broadcast to conversation room
    const room = this.conversationRoom(payload.conversationId);
    // debug: log room membership before broadcasting
    try {
      const adapter = (this.server as any).adapter || (this.server as any).sockets?.adapter;
      const adapterRooms = adapter?.rooms;
      const roomSockets = adapterRooms?.get(room);
      this.logger.log(`Broadcasting message ${saved.id} to room ${room}`);
      this.logger.log(`Room ${room} has ${roomSockets ? roomSockets.size : 0} socket(s)`);
      if (roomSockets && roomSockets.size > 0) {
        this.logger.log(`Sockets in room: ${Array.from(roomSockets).join(', ')}`);
      }
    } catch (err) {
      this.logger.warn('Failed to read room sockets for debugging', err?.message ?? err);
    }

    this.server.to(room).emit('message', saved);

    // create delivery jobs for participants (excluding sender)
    const participantIds = await this.chatService.getConversationParticipantIds(payload.conversationId);
    const receivers = participantIds.filter((id) => id !== user.id);

    if (receivers.length) {
      await this.chatService.createDeliveryJobs({
        messageId: saved.id,
        conversationId: payload.conversationId,
        receiverIds: receivers,
      });

      // Send receive_message and new_message events to each recipient's personal user room
      for (const receiverId of receivers) {
        this.sendToUser(receiverId, 'receive_message', saved);
        this.sendToUser(receiverId, 'new_message', saved);
      }
    }

    return { ok: true, messageId: saved.id };
  }
}
