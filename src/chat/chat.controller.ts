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

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
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
      relations: ['lastMessage'],
    });

    const allParts = await this.participantRepo.find({
      where: { conversationId: In(conversationIds) },
      relations: ['user'],
    });

    return convs.map((conv) => {
      const members = allParts.filter((p) => p.conversationId === conv.id);
      return { ...conv, members };
    });
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
}
