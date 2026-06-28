import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  MoreThan,
  Repository,
} from 'typeorm';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Conversation } from './entities/conversation.entity';
import { DirectConversation } from './entities/direct-conversation.entity';
import { Message } from './entities/message.entity';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,

    @InjectRepository(Conversation)
    private readonly conversationRepo:
      Repository<Conversation>,

    @InjectRepository(DirectConversation)
    private readonly directRepo:
      Repository<DirectConversation>,

    @InjectRepository(ConversationParticipant)
    private readonly participantRepo:
      Repository<ConversationParticipant>,

    @InjectRepository(Message)
    private readonly messageRepo:
      Repository<Message>,
  ) {}

  @Get('sync')
  async syncMessages(
    @Req() req: any,
    @Query('since') since?: string,
  ) {
    const me = req.user;

    const parts =
      await this.participantRepo.find({
        where: {
          userId: me.id,
        },
      });

    const conversationIds = parts.map(
      (participant) =>
        participant.conversationId,
    );

    if (conversationIds.length === 0) {
      return [];
    }

    const date = since
      ? new Date(since)
      : new Date(0);

    return this.messageRepo.find({
      where: {
        conversationId: In(
          conversationIds,
        ),
        createdAt: MoreThan(date),
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  @Post('direct')
  async createDirect(
    @Req() req: any,
    @Body()
    body: {
      otherUserId: string;
    },
  ) {
    const me = req.user;
    const otherUserId =
      body.otherUserId;

    if (me.id === otherUserId) {
      return {
        error:
          'cannot create direct with self',
      };
    }

    /*
     * Store UUIDs in a consistent order so the
     * same direct conversation is not duplicated.
     */
    const [userOneId, userTwoId] =
      me.id < otherUserId
        ? [me.id, otherUserId]
        : [otherUserId, me.id];

    let direct =
      await this.directRepo.findOne({
        where: {
          userOneId,
          userTwoId,
        },
        relations: ['conversation'],
      });

    if (direct) {
      return {
        conversationId:
          direct.conversationId,
      };
    }

    const conversation =
      this.conversationRepo.create({
        type: 'direct' as any,
      });

    const savedConversation =
      await this.conversationRepo.save(
        conversation,
      );

    direct = this.directRepo.create({
      conversationId:
        savedConversation.id,
      userOneId,
      userTwoId,
    });

    await this.directRepo.save(direct);

    const firstParticipant =
      this.participantRepo.create({
        conversationId:
          savedConversation.id,
        userId: userOneId,
      });

    const secondParticipant =
      this.participantRepo.create({
        conversationId:
          savedConversation.id,
        userId: userTwoId,
      });

    await this.participantRepo.save([
      firstParticipant,
      secondParticipant,
    ]);

    return {
      conversationId:
        savedConversation.id,
    };
  }

  @Get('conversations')
  async listConversations(
    @Req() req: any,
  ) {
    const me = req.user;

    const myParticipants =
      await this.participantRepo.find({
        where: {
          userId: me.id,
        },
      });

    const conversationIds =
      myParticipants.map(
        (participant) =>
          participant.conversationId,
      );

    if (conversationIds.length === 0) {
      return [];
    }

    const conversations =
      await this.conversationRepo.find({
        where: {
          id: In(conversationIds),
        },
        relations: [
          'lastMessage',
          'lastMessage.sender',
        ],
      });

    const allParticipants =
      await this.participantRepo.find({
        where: {
          conversationId: In(
            conversationIds,
          ),
        },
        relations: ['user'],
      });

    const enriched = conversations.map(
      (conversation) => {
        const members = allParticipants
          .filter(
            (participant) =>
              participant.conversationId ===
              conversation.id,
          )
          .map((participant) => ({
            id: participant.id,
            conversationId:
              participant.conversationId,
            userId:
              participant.userId,

            user: participant.user
              ? {
                  id:
                    participant.user.id,
                  fullName:
                    participant.user
                      .fullName,
                  avatarUrl:
                    participant.user
                      .profilePhotoFileId,
                  profilePhotoFileId:
                    participant.user
                      .profilePhotoFileId,
                }
              : null,

            lastReadMessageId:
              participant.lastReadMessageId,
            lastReadSequenceNo:
              participant.lastReadSequenceNo,
            lastReadAt:
              participant.lastReadAt,

            lastDeliveredMessageId:
              participant
                .lastDeliveredMessageId,
            lastDeliveredSequenceNo:
              participant
                .lastDeliveredSequenceNo,
            lastDeliveredAt:
              participant
                .lastDeliveredAt,

            unreadCount:
              participant.unreadCount,
            isMuted:
              participant.isMuted,
            archivedAt:
              participant.archivedAt,
            joinedAt:
              participant.joinedAt,
            createdAt:
              participant.createdAt,
            updatedAt:
              participant.updatedAt,
          }));

        const meParticipant =
          members.find(
            (participant) =>
              participant.userId ===
              me.id,
          );

        const otherMember =
          members.find(
            (participant) =>
              participant.userId !==
              me.id,
          );

        const unreadCount =
          meParticipant?.unreadCount ??
          0;

        const lastReadSequenceNo =
          meParticipant
            ?.lastReadSequenceNo ?? 0;

        const lastReadAt =
          meParticipant?.lastReadAt ??
          null;

        const lastMessage =
          conversation.lastMessage
            ? {
                id:
                  conversation
                    .lastMessage.id,

                content:
                  conversation
                    .lastMessage.content,

                sequenceNo:
                  conversation
                    .lastMessage
                    .sequenceNo,

                messageType:
                  conversation
                    .lastMessage
                    .messageType,

                senderId:
                  conversation
                    .lastMessage
                    .senderId,

                sender:
                  conversation
                    .lastMessage.sender
                    ? {
                        id:
                          conversation
                            .lastMessage
                            .sender.id,

                        fullName:
                          conversation
                            .lastMessage
                            .sender
                            .fullName,
                      }
                    : null,

                createdAt:
                  conversation
                    .lastMessage
                    .createdAt,
              }
            : null;

        const lastMessageReadByOthers =
          lastMessage &&
          lastMessage.senderId ===
            me.id
            ? members
                .filter(
                  (participant) =>
                    participant.userId !==
                    me.id,
                )
                .every(
                  (participant) =>
                    (participant
                      .lastReadSequenceNo ??
                      0) >=
                    lastMessage.sequenceNo,
                )
            : false;

        const lastMessageDeliveredToMe =
          lastMessage &&
          lastMessage.senderId !==
            me.id
            ? (meParticipant
                ?.lastDeliveredSequenceNo ??
                0) >=
              lastMessage.sequenceNo
            : true;

        const isHighlighted =
          Boolean(
            lastMessage &&
              (meParticipant
                ?.lastReadSequenceNo ??
                0) <
                lastMessage.sequenceNo &&
              lastMessage.senderId !==
                me.id,
          );

        return {
          id: conversation.id,
          type: conversation.type,

          lastMessageAt:
            conversation.lastMessageAt,

          createdAt:
            conversation.createdAt,

          updatedAt:
            conversation.updatedAt,

          participantId:
            otherMember?.userId ??
            null,

          participant:
            otherMember?.user
              ? {
                  id:
                    otherMember.user.id,

                  fullName:
                    otherMember.user
                      .fullName,

                  avatarUrl:
                    otherMember.user
                      .avatarUrl,

                  isOnline: false,
                }
              : null,

          members,

          unreadCount,
          hasUnread:
            unreadCount > 0,

          lastReadSequenceNo,
          lastReadAt,
          lastMessage,

          lastMessageStatus: {
            isMyMessage:
              lastMessage?.senderId ===
              me.id,

            isReadByOthers:
              lastMessageReadByOthers,

            isDeliveredToMe:
              lastMessageDeliveredToMe,
          },

          isHighlighted,
        };
      },
    );

    return enriched.sort(
      (first, second) => {
        const firstTime =
          first.lastMessageAt
            ? new Date(
                first.lastMessageAt,
              ).getTime()
            : new Date(
                first.createdAt,
              ).getTime();

        const secondTime =
          second.lastMessageAt
            ? new Date(
                second.lastMessageAt,
              ).getTime()
            : new Date(
                second.createdAt,
              ).getTime();

        return secondTime - firstTime;
      },
    );
  }

  @Get('peers')
  async listPeers(@Req() req: any) {
    const me = req.user;

    const participants =
      await this.participantRepo.find({
        where: {
          userId: me.id,
        },
      });

    const conversationIds =
      participants.map(
        (participant) =>
          participant.conversationId,
      );

    if (conversationIds.length === 0) {
      return [];
    }

    const allParticipants =
      await this.participantRepo.find({
        where: {
          conversationId: In(
            conversationIds,
          ),
        },
        relations: ['user'],
      });

    const usersById =
      new Map<string, any>();

    for (
      const participant of
        allParticipants
    ) {
      if (
        participant.userId === me.id ||
        !participant.user
      ) {
        continue;
      }

      usersById.set(
        participant.userId,
        participant.user,
      );
    }

    return Array.from(
      usersById.values(),
    );
  }

  @Get('conversations/:id/messages')
  async getMessages(
    @Req() req: any,
    @Param('id') id: string,
    @Query('limit') limit = '50',
  ) {
    const me = req.user;

    const participant =
      await this.participantRepo.findOne({
        where: {
          conversationId: id,
          userId: me.id,
        },
      });

    if (!participant) {
      return {
        error: 'not a participant',
      };
    }

    return this.messageRepo.find({
      where: {
        conversationId: id,
      },
      order: {
        sequenceNo: 'ASC',
      },
      take: Number(limit),
    });
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { content?: string; messageType?: string },
  ) {
    const me = req.user;

    // Guard: caller must be a participant of this conversation.
    const participant = await this.participantRepo.findOne({
      where: { conversationId: id, userId: me.id },
    });

    if (!participant) {
      return { error: 'not a participant' };
    }

    // Persist the message using the same service path as the socket handler.
    const savedMessage = await this.chatService.createMessage({
      conversationId: id,
      senderId: me.id,
      content: body.content ?? null,
      messageType: body.messageType,
    });

    const room = `conversation:${id}`;

    // Broadcast to users already viewing this conversation room.
    (this.chatGateway.server as any).to(room).emit('message', savedMessage);

    // Notify each receiver individually and update unread counts.
    const participantIds =
      await this.chatService.getConversationParticipantIds(id);

    const receiverIds = participantIds.filter((pid) => pid !== me.id);

    if (receiverIds.length > 0) {
      await this.chatService.createDeliveryJobs({
        messageId: savedMessage.id,
        conversationId: id,
        receiverIds,
      });

      for (const receiverId of receiverIds) {
        this.chatGateway.sendToUser(
          receiverId,
          'receive_message',
          savedMessage,
        );
        this.chatGateway.sendToUser(
          receiverId,
          'new_message',
          savedMessage,
        );

        try {
          await this.participantRepo.increment(
            { conversationId: id, userId: receiverId },
            'unreadCount',
            1,
          );

          const receiverParticipant = await this.participantRepo.findOne({
            where: { conversationId: id, userId: receiverId },
          });

          const isHighlighted = Boolean(
            (receiverParticipant?.lastReadSequenceNo ?? 0) <
              savedMessage.sequenceNo &&
              savedMessage.senderId !== receiverId,
          );

          this.chatGateway.sendToUser(
            receiverId,
            'conversation:unread',
            {
              conversationId: id,
              unreadCount: receiverParticipant?.unreadCount ?? 0,
              isHighlighted,
            },
          );
        } catch {
          // Non-fatal: unread count update failure should not fail the request.
        }
      }
    }

    return savedMessage;
  }

  @Post('conversations/:id/read')
  async markConversationRead(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      lastReadMessageId?: string;
      readAt?: string;
    } = {},
  ) {
    const me = req.user;

    const participant =
      await this.participantRepo.findOne({
        where: {
          conversationId: id,
          userId: me.id,
        },
      });

    if (!participant) {
      return {
        error: 'not a participant',
      };
    }

    let targetSequence = 0;

    let targetMessageId =
      body.lastReadMessageId ?? null;

    if (body.lastReadMessageId) {
      const message =
        await this.messageRepo.findOne({
          where: {
            id:
              body.lastReadMessageId,
          },
        });

      if (
        !message ||
        message.conversationId !== id
      ) {
        return {
          error: 'invalid message',
        };
      }

      targetSequence =
        message.sequenceNo;
    } else {
      const conversation =
        await this.conversationRepo.findOne({
          where: {
            id,
          },
          relations: ['lastMessage'],
        });

      if (conversation?.lastMessage) {
        targetSequence =
          conversation.lastMessage
            .sequenceNo;

        targetMessageId =
          conversation.lastMessageId;
      }
    }

    const incomingReadAt = body.readAt
      ? new Date(body.readAt)
      : new Date();

    /*
     * The request is idempotent. Do not move the
     * participant's read position backwards.
     */
    if (
      (participant.lastReadSequenceNo ??
        0) >= targetSequence
    ) {
      const conversation =
        await this.conversationRepo.findOne({
          where: {
            id,
          },
          relations: ['lastMessage'],
        });

      const unreadCount =
        participant.unreadCount ?? 0;

      const isHighlighted =
        Boolean(
          conversation?.lastMessage &&
            (participant
              .lastReadSequenceNo ??
              0) <
              conversation.lastMessage
                .sequenceNo &&
            conversation.lastMessage
              .senderId !== me.id,
        );

      return {
        unreadCount,
        isHighlighted,
      };
    }

    participant.lastReadMessageId =
      targetMessageId;

    participant.lastReadSequenceNo =
      targetSequence;

    participant.lastReadAt =
      incomingReadAt;

    participant.unreadCount = 0;

    await this.participantRepo.save(
      participant,
    );

    try {
      const payload = {
        conversationId: id,
        userId: me.id,
        lastReadMessageId:
          participant.lastReadMessageId,
        lastReadAt:
          participant.lastReadAt,
      };

      (
        this.chatGateway.server as any
      )
        .to(`conversation:${id}`)
        .emit(
          'conversation:read',
          payload,
        );

      const conversationParticipants =
        await this.participantRepo.find({
          where: {
            conversationId: id,
          },
          select: ['userId'],
        });

      for (
        const conversationParticipant of
          conversationParticipants
      ) {
        this.chatGateway.sendToUser(
          conversationParticipant.userId,
          'conversation:read',
          payload,
        );
      }
    } catch {
      /*
       * The REST request should still succeed when
       * a WebSocket notification cannot be emitted.
       */
    }

    return {
      unreadCount: 0,
      isHighlighted: false,
    };
  }
}
