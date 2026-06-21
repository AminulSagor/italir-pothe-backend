import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Conversation } from './entities/conversation.entity';
import { DirectConversation } from './entities/direct-conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan } from 'typeorm';
import { Message } from './entities/message.entity';
import { ChatGateway } from './chat.gateway';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(DirectConversation)
    private readonly directRepo: Repository<DirectConversation>,
    @InjectRepository(ConversationParticipant)
    private readonly participantRepo: Repository<ConversationParticipant>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
  ) {}

  @Get('sync')
  async syncMessages(
    @Req() req: any,
    @Query('since') since?: string,
  ) {
    const me = req.user;
    const parts = await this.participantRepo.find({ where: { userId: me.id } });
    const conversationIds = parts.map((p) => p.conversationId);
    if (!conversationIds.length) return [];

    const date = since ? new Date(since) : new Date(0);

    const msgs = await this.messageRepo.find({
      where: {
        conversationId: In(conversationIds),
        createdAt: MoreThan(date),
      },
      order: { createdAt: 'ASC' },
    });
    return msgs;
  }

  @Post('direct')
  async createDirect(@Req() req: any, @Body() body: { otherUserId: string }) {
    const me = req.user;
    const other = body.otherUserId;
    if (me.id === other) return { error: 'cannot create direct with self' };

    // enforce smaller uuid first
    const [userOneId, userTwoId] = me.id < other ? [me.id, other] : [other, me.id];

    let direct = await this.directRepo.findOne({
      where: { userOneId, userTwoId },
      relations: ['conversation'],
    });

    if (direct) return { conversationId: direct.conversationId };

    const conv = this.conversationRepo.create({ type: 'direct' as any });
    const savedConv = await this.conversationRepo.save(conv);

    direct = this.directRepo.create({
      conversationId: savedConv.id,
      userOneId,
      userTwoId,
    });
    await this.directRepo.save(direct);

    // add participants
    const p1 = this.participantRepo.create({ conversationId: savedConv.id, userId: userOneId });
    const p2 = this.participantRepo.create({ conversationId: savedConv.id, userId: userTwoId });
    await this.participantRepo.save([p1, p2]);

    return { conversationId: savedConv.id };
  }

  @Get('conversations')
  async listConversations(@Req() req: any) {
    const me = req.user;
    const parts = await this.participantRepo.find({ where: { userId: me.id } });
    const conversationIds = parts.map((p) => p.conversationId);
    if (!conversationIds.length) return [];

    const convs = await this.conversationRepo.find({
      where: { id: In(conversationIds) },
      relations: ['lastMessage', 'lastMessage.sender'],
    });

    const allParts = await this.participantRepo.find({
      where: { conversationId: In(conversationIds) },
      relations: ['user'],
    });

    const enriched = convs.map((conv) => {
      const members = allParts
        .filter((p) => p.conversationId === conv.id)
        .map((p) => ({
          id: p.id,
          conversationId: p.conversationId,
          userId: p.userId,
          user: p.user
            ? {
                id: p.user.id,
                fullName: p.user.fullName,
                name: p.user.name,
                avatarUrl: p.user.avatarUrl,
                profilePhotoFileId: p.user.profilePhotoFileId,
              }
            : null,
          lastReadMessageId: p.lastReadMessageId,
          lastReadSequenceNo: p.lastReadSequenceNo,
          lastReadAt: p.lastReadAt,
          lastDeliveredMessageId: p.lastDeliveredMessageId,
          lastDeliveredSequenceNo: p.lastDeliveredSequenceNo,
          lastDeliveredAt: p.lastDeliveredAt,
          unreadCount: p.unreadCount,
          isMuted: p.isMuted,
          archivedAt: p.archivedAt,
          joinedAt: p.joinedAt,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }));
      const meParticipant = members.find((p) => p.userId === me.id);
      const unreadCount = meParticipant?.unreadCount ?? 0;
      const lastReadSequenceNo = meParticipant?.lastReadSequenceNo ?? 0;
      const lastReadAt = meParticipant?.lastReadAt ?? null;

      const lastMessage = conv.lastMessage
        ? {
            id: conv.lastMessage.id,
            content: conv.lastMessage.content,
            sequenceNo: conv.lastMessage.sequenceNo,
            messageType: conv.lastMessage.messageType,
            senderId: conv.lastMessage.senderId,
            sender: conv.lastMessage.sender
              ? {
                  id: conv.lastMessage.sender.id,
                  name: conv.lastMessage.sender.name,
                }
              : null,
            createdAt: conv.lastMessage.createdAt,
          }
        : null;

      const lastMessageReadByOthers =
        lastMessage && lastMessage.senderId === me.id
          ? members
              .filter((p) => p.userId !== me.id)
              .every((p) => p.lastReadSequenceNo >= lastMessage.sequenceNo)
          : false;

      const lastMessageDeliveredToMe =
        lastMessage && lastMessage.senderId !== me.id
          ? (meParticipant?.lastDeliveredSequenceNo ?? 0) >= lastMessage.sequenceNo
          : true;

      const isHighlighted = Boolean(
        lastMessage && (meParticipant?.lastReadSequenceNo ?? 0) < lastMessage.sequenceNo && lastMessage.senderId !== me.id,
      );

      return {
        id: conv.id,
        type: conv.type,
        lastMessageAt: conv.lastMessageAt,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        members,
        unreadCount,
        hasUnread: unreadCount > 0,
        lastReadSequenceNo,
        lastReadAt,
        lastMessage,
        lastMessageStatus: {
          isMyMessage: lastMessage?.senderId === me.id,
          isReadByOthers: lastMessageReadByOthers,
          isDeliveredToMe: lastMessageDeliveredToMe,
        },
        isHighlighted,
      };
    });

    return enriched.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : new Date(a.createdAt).getTime();
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });
  }

  @Get('peers')
  async listPeers(@Req() req: any) {
    const me = req.user;
    const parts = await this.participantRepo.find({ where: { userId: me.id } });
    const conversationIds = parts.map((p) => p.conversationId);
    if (!conversationIds.length) return [];

    const allParts = await this.participantRepo.find({
      where: { conversationId: In(conversationIds) },
      relations: ['user'],
    });

    const map = new Map<string, any>();
    for (const p of allParts) {
      if (p.userId === me.id) continue;
      if (!p.user) continue;
      map.set(p.userId, p.user);
    }

    return Array.from(map.values());
  }

  @Get('conversations/:id/messages')
  async getMessages(
    @Req() req: any,
    @Param('id') id: string,
    @Query('limit') limit = '50',
  ) {
    const me = req.user;
    const parts = await this.participantRepo.findOne({ where: { conversationId: id, userId: me.id } });
    if (!parts) return { error: 'not a participant' };

    const msgs = await this.messageRepo.find({ where: { conversationId: id }, order: { sequenceNo: 'ASC' }, take: Number(limit) });
    return msgs;
  }

  @Post('conversations/:id/read')
  async markConversationRead(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { lastReadMessageId?: string; readAt?: string } = {},
  ) {
    const me = req.user;

    const participant = await this.participantRepo.findOne({ where: { conversationId: id, userId: me.id } });
    if (!participant) return { error: 'not a participant' };

    // Determine target sequence
    let targetSequence = 0;
    let targetMessageId = body.lastReadMessageId ?? null;
    if (body.lastReadMessageId) {
      const msg = await this.messageRepo.findOne({ where: { id: body.lastReadMessageId } });
      if (!msg || msg.conversationId !== id) return { error: 'invalid message' };
      targetSequence = msg.sequenceNo;
    } else {
      const conv = await this.conversationRepo.findOne({ where: { id }, relations: ['lastMessage'] });
      if (conv?.lastMessage) {
        targetSequence = conv.lastMessage.sequenceNo;
        targetMessageId = conv.lastMessageId;
      }
    }

    const incomingReadAt = body.readAt ? new Date(body.readAt) : new Date();

    // Idempotent: only update if incoming is newer
    if ((participant.lastReadSequenceNo ?? 0) >= targetSequence) {
      // compute current unread/isHighlighted
      const conv = await this.conversationRepo.findOne({ where: { id }, relations: ['lastMessage'] });
      const unreadCount = participant.unreadCount ?? 0;
      const isHighlighted = Boolean(conv?.lastMessage && (participant.lastReadSequenceNo ?? 0) < conv.lastMessage.sequenceNo && conv.lastMessage.senderId !== me.id);
      return { unreadCount, isHighlighted };
    }

    participant.lastReadMessageId = targetMessageId;
    participant.lastReadSequenceNo = targetSequence;
    participant.lastReadAt = incomingReadAt;
    participant.unreadCount = 0;

    await this.participantRepo.save(participant);

    // notify via websocket to conversation room and users
    try {
      const payload = { conversationId: id, userId: me.id, lastReadMessageId: participant.lastReadMessageId, lastReadAt: participant.lastReadAt };
      // conversation room
      (this.chatGateway.server as any).to(`conversation:${id}`).emit('conversation:read', payload);

      // notify participants' user rooms so inbox updates
      const parts = await this.participantRepo.find({ where: { conversationId: id }, select: ['userId'] });
      for (const p of parts) {
        this.chatGateway.sendToUser(p.userId, 'conversation:read', payload);
      }
    } catch (err) {
      // ignore websocket errors
    }

    return { unreadCount: 0, isHighlighted: false };
  }
}
