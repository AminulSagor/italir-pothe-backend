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
import { CallService } from './services/call.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Conversation } from './entities/conversation.entity';
import { DirectConversation } from './entities/direct-conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Call, CallStatus, CallType } from './entities/call.entity';
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
    private readonly callService: CallService,
    private readonly userBlocksService: UserBlocksService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(DirectConversation)
    private readonly directConversationRepo: Repository<DirectConversation>,
    @InjectRepository(ConversationParticipant)
    private readonly participantRepo: Repository<ConversationParticipant>,
    @InjectRepository(Call)
    private readonly callRepo: Repository<Call>,
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
        try {
          // increment unreadCount for receiver
          await this.participantRepo.increment({ conversationId: payload.conversationId, userId: receiverId }, 'unreadCount', 1);
          const p = await this.participantRepo.findOne({ where: { conversationId: payload.conversationId, userId: receiverId } });
          const isHighlighted = Boolean((p?.lastReadSequenceNo ?? 0) < saved.sequenceNo && saved.senderId !== receiverId);
          const unreadPayload = { conversationId: payload.conversationId, unreadCount: p?.unreadCount ?? 0, isHighlighted };
          this.sendToUser(receiverId, 'conversation:unread', unreadPayload);
        } catch (err) {
          this.logger.warn('Failed to update unread count for receiver', err?.message ?? err);
        }
      }
    }

    return { ok: true, messageId: saved.id };
  }

  @SubscribeMessage('call:initiate')
  async handleInitiateCall(
    client: Socket,
    payload: {
      directConversationId: string;
      recipientId: string;
      callType: 'audio' | 'video';
    },
  ) {
    const user: User = client.data.user;
    if (!user) return { error: 'Unauthorized' };

    try {
      // Check if users are blocked
      await this.userBlocksService.assertCanMessage(user.id, payload.recipientId);

      const callType = payload.callType === 'audio' ? CallType.AUDIO : CallType.VIDEO;

      const call = await this.callService.initiateCall({
        directConversationId: payload.directConversationId,
        callerId: user.id,
        recipientId: payload.recipientId,
        callType: callType,
      });

      // Generate token for caller
      const agoraToken = this.callService.generateAgoraToken({
        call,
        userId: user.id,
      });

      // Notify recipient in their personal room
      this.sendToUser(payload.recipientId, 'call:incoming', {
        callId: call.id,
        callerId: user.id,
        callerName: user.fullName,
        callType: payload.callType,
        timestamp: new Date(),
      });

      // Send token to caller
      client.emit('call:initiated', {
        callId: call.id,
        agoraToken,
      });

      this.logger.log(
        `Call initiated from ${user.id} to ${payload.recipientId}: ${call.id}`,
      );

      return { ok: true, callId: call.id };
    } catch (error) {
      this.logger.error(`Failed to initiate call: ${error.message}`);
      return { error: error.message };
    }
  }

  @SubscribeMessage('call:answer')
  async handleAnswerCall(client: Socket, payload: { callId: string }) {
    const user: User = client.data.user;
    if (!user) return { error: 'Unauthorized' };

    try {
      const call = await this.callService.answerCall(payload.callId, user.id);

      // Generate token for recipient
      const agoraToken = this.callService.generateAgoraToken({
        call,
        userId: user.id,
      });

      // Notify caller
      this.sendToUser(call.callerId, 'call:answered', {
        callId: call.id,
        timestamp: new Date(),
      });

      // Send token to recipient
      client.emit('call:agoraToken', agoraToken);

      this.logger.log(`Call answered: ${payload.callId}`);

      return { ok: true, agoraToken };
    } catch (error) {
      this.logger.error(`Failed to answer call: ${error.message}`);
      return { error: error.message };
    }
  }

  @SubscribeMessage('call:reject')
  async handleRejectCall(client: Socket, payload: { callId: string }) {
    const user: User = client.data.user;
    if (!user) return { error: 'Unauthorized' };

    try {
      const call = await this.callService.rejectCall(payload.callId, user.id);

      // Notify caller
      this.sendToUser(call.callerId, 'call:rejected', {
        callId: call.id,
        timestamp: new Date(),
      });

      this.logger.log(`Call rejected: ${payload.callId}`);

      return { ok: true };
    } catch (error) {
      this.logger.error(`Failed to reject call: ${error.message}`);
      return { error: error.message };
    }
  }

  @SubscribeMessage('call:end')
  async handleEndCall(client: Socket, payload: { callId: string }) {
    const user: User = client.data.user;
    if (!user) return { error: 'Unauthorized' };

    try {
      const call = await this.callService.endCall(payload.callId, user.id);

      const otherUserId = user.id === call.callerId ? call.recipientId : call.callerId;

      // Notify the other user
      this.sendToUser(otherUserId, 'call:ended', {
        callId: call.id,
        duration: call.durationSeconds,
        timestamp: new Date(),
      });

      this.logger.log(`Call ended: ${payload.callId}, Duration: ${call.durationSeconds}s`);

      return { ok: true, duration: call.durationSeconds };
    } catch (error) {
      this.logger.error(`Failed to end call: ${error.message}`);
      return { error: error.message };
    }
  }

  @SubscribeMessage('call:history')
  async handleCallHistory(client: Socket, payload: { directConversationId: string }) {
    const user: User = client.data.user;
    if (!user) return { error: 'Unauthorized' };

    try {
      const history = await this.callService.getCallHistory(
        payload.directConversationId,
        50,
      );

      return { ok: true, calls: history };
    } catch (error) {
      this.logger.error(`Failed to fetch call history: ${error.message}`);
      return { error: error.message };
    }
  }

  @SubscribeMessage('presence:heartbeat')
  async handlePresenceHeartbeat(client: Socket) {
    const user: User = client.data.user;
    if (!user) return { error: 'Unauthorized' };

    try {
      const res = await this.presenceService.heartbeat(user.id);
      return res;
    } catch (err) {
      this.logger.warn(`presence heartbeat failed for ${user.id}`, err?.message ?? err);
      return { error: 'Failed to refresh presence' };
    }
  }

  @SubscribeMessage('call:active')
  async handleGetActiveCall(client: Socket, payload: { directConversationId: string }) {
    const user: User = client.data.user;
    if (!user) return { error: 'Unauthorized' };

    try {
      const activeCall = await this.callService.getActiveCall(
        payload.directConversationId,
      );

      return { ok: true, call: activeCall || null };
    } catch (error) {
      this.logger.error(`Failed to fetch active call: ${error.message}`);
      return { error: error.message };
    }
  }
}
