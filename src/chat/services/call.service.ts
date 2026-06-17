import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Call, CallStatus, CallType } from '../entities/call.entity';
import { DirectConversation } from '../entities/direct-conversation.entity';
import { User } from '../../users/entities/user.entity';
import {
  AgoraTokenService,
  AgoraLiveRole,
} from '../../webinar/services/agora-token.service';
import { UserDeviceService } from './user-device.service';
import { FirebasePushService } from '../../notifications/firebase-push.service';

@Injectable()
export class CallService {
  private readonly logger = new Logger(CallService.name);

  constructor(
    @InjectRepository(Call)
    private readonly callRepo: Repository<Call>,

    @InjectRepository(DirectConversation)
    private readonly directConversationRepo: Repository<DirectConversation>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly agoraTokenService: AgoraTokenService,
    private readonly userDeviceService: UserDeviceService,
    private readonly firebasePushService: FirebasePushService,
  ) {}

  async initiateCall(params: {
    directConversationId: string;
    callerId: string;
    recipientId: string;
    callType: CallType;
  }): Promise<Call> {
    const directConversation = await this.directConversationRepo.findOne({
      where: { id: params.directConversationId },
    });

    if (!directConversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (
      ![directConversation.userOneId, directConversation.userTwoId].includes(
        params.callerId,
      ) ||
      ![directConversation.userOneId, directConversation.userTwoId].includes(
        params.recipientId,
      )
    ) {
      throw new BadRequestException('Users are not part of this conversation');
    }

    const activeOrPendingCall = await this.callRepo.findOne({
      where: [
        {
          directConversationId: params.directConversationId,
          status: CallStatus.ACTIVE,
        },
        {
          directConversationId: params.directConversationId,
          status: CallStatus.PENDING,
        },
      ],
    });

    if (activeOrPendingCall) {
      throw new ConflictException('A call already exists in this conversation');
    }

    const call = this.callRepo.create({
      directConversationId: params.directConversationId,
      callerId: params.callerId,
      recipientId: params.recipientId,
      callType: params.callType,
      agoraChannelName: `call_${params.directConversationId}_${Date.now()}`,
      callerAgoraUid: this.generateUid(),
      recipientAgoraUid: this.generateUid(),
      status: CallStatus.PENDING,
    });

    const savedCall = await this.callRepo.save(call);
    this.logger.log(`Call initiated: ${savedCall.id}`);

    return savedCall;
  }

  async initiateCallForRest(params: {
    directConversationId: string;
    callerId: string;
    recipientId: string;
    callType: CallType;
  }) {
    const call = await this.initiateCall(params);

    const agoraToken = this.generateAgoraToken({
      call,
      userId: params.callerId,
    });

    await this.sendIncomingCallPush(call);

    return {
      call,
      agoraToken,
    };
  }

  async answerCall(callId: string, recipientId: string): Promise<Call> {
    const call = await this.callRepo.findOne({ where: { id: callId } });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    if (call.recipientId !== recipientId) {
      throw new BadRequestException('Not authorized to answer this call');
    }

    if (call.status !== CallStatus.PENDING) {
      throw new BadRequestException(
        `Cannot answer a call with status: ${call.status}`,
      );
    }

    call.status = CallStatus.ACTIVE;
    call.answeredAt = new Date();

    const savedCall = await this.callRepo.save(call);
    this.logger.log(`Call answered: ${callId}`);

    return savedCall;
  }

  async answerCallForRest(callId: string, recipientId: string) {
    const call = await this.answerCall(callId, recipientId);

    const agoraToken = this.generateAgoraToken({
      call,
      userId: recipientId,
    });

    await this.sendCallStatusPush(call.callerId, {
      type: 'call_accepted',
      callId: call.id,
      directConversationId: call.directConversationId,
    });

    return {
      call,
      agoraToken,
    };
  }

  async rejectCall(callId: string, recipientId: string): Promise<Call> {
    const call = await this.callRepo.findOne({ where: { id: callId } });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    if (call.recipientId !== recipientId) {
      throw new BadRequestException('Not authorized to reject this call');
    }

    if (call.status !== CallStatus.PENDING) {
      throw new BadRequestException('Cannot reject a call that is not pending');
    }

    call.status = CallStatus.REJECTED;
    call.endedAt = new Date();

    const savedCall = await this.callRepo.save(call);
    this.logger.log(`Call rejected: ${callId}`);

    return savedCall;
  }

  async rejectCallForRest(callId: string, recipientId: string): Promise<Call> {
    const call = await this.rejectCall(callId, recipientId);

    await this.sendCallStatusPush(call.callerId, {
      type: 'call_rejected',
      callId: call.id,
      directConversationId: call.directConversationId,
    });

    return call;
  }

  async endCall(callId: string, userId: string): Promise<Call> {
    const call = await this.callRepo.findOne({ where: { id: callId } });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    if (call.callerId !== userId && call.recipientId !== userId) {
      throw new BadRequestException('Not authorized to end this call');
    }

    if (call.status === CallStatus.ENDED) {
      return call;
    }

    call.status = CallStatus.ENDED;
    call.endedAt = new Date();

    if (call.answeredAt) {
      const durationMs = call.endedAt.getTime() - call.answeredAt.getTime();
      call.durationSeconds = Math.floor(durationMs / 1000);
    }

    const savedCall = await this.callRepo.save(call);
    this.logger.log(`Call ended: ${callId}`);

    return savedCall;
  }

  async endCallForRest(callId: string, userId: string): Promise<Call> {
    const call = await this.endCall(callId, userId);

    const otherUserId =
      userId === call.callerId ? call.recipientId : call.callerId;

    await this.sendCallStatusPush(otherUserId, {
      type: 'call_ended',
      callId: call.id,
      directConversationId: call.directConversationId,
      durationSeconds: call.durationSeconds,
    });

    return call;
  }

  generateAgoraToken(params: { call: Call; userId: string }) {
    const { call, userId } = params;

    let uid: number;

    if (userId === call.callerId) {
      uid = call.callerAgoraUid;
    } else if (userId === call.recipientId) {
      uid = call.recipientAgoraUid;
    } else {
      throw new BadRequestException('User is not part of this call');
    }

    return this.agoraTokenService.buildRtcToken({
      channelName: call.agoraChannelName,
      uid,
      role: AgoraLiveRole.PUBLISHER,
    });
  }

  async getCallHistory(directConversationId: string, limit = 50) {
    return this.callRepo.find({
      where: { directConversationId },
      order: { initiatedAt: 'DESC' },
      take: limit,
      select: [
        'id',
        'callerId',
        'recipientId',
        'callType',
        'status',
        'initiatedAt',
        'answeredAt',
        'endedAt',
        'durationSeconds',
      ],
    });
  }

  async getActiveCall(directConversationId: string) {
    return this.callRepo.findOne({
      where: {
        directConversationId,
        status: CallStatus.ACTIVE,
      },
    });
  }

  async markMissedCalls(recipientId: string) {
    const missedCalls = await this.callRepo.find({
      where: {
        recipientId,
        status: CallStatus.PENDING,
      },
    });

    for (const call of missedCalls) {
      const now = new Date();

      if (now.getTime() - call.initiatedAt.getTime() > 2 * 60 * 1000) {
        call.status = CallStatus.MISSED;
        call.endedAt = now;
        await this.callRepo.save(call);
      }
    }

    return missedCalls.length;
  }

  private async sendIncomingCallPush(call: Call): Promise<void> {
    try {
      const tokens = await this.getUserFcmTokens(call.recipientId);

      const caller = await this.userRepo.findOne({
        where: { id: call.callerId },
        select: ['id', 'fullName', 'profilePhotoFileId'],
      });

      await this.firebasePushService.sendIncomingCallPush({
        tokens,
        callId: call.id,
        directConversationId: call.directConversationId,
        callerId: call.callerId,
        callerName: caller?.fullName ?? 'Incoming call',
        callerAvatarUrl: '',
        callType: call.callType === CallType.AUDIO ? 'audio' : 'video',
        agoraChannelName: call.agoraChannelName,
      });
    } catch (error: unknown) {
      const message = this.getErrorMessage(error);
      this.logger.error(`Failed to send incoming call push: ${message}`);
    }
  }

  private async sendCallStatusPush(
    userId: string,
    payload: {
      type: 'call_accepted' | 'call_rejected' | 'call_ended' | 'missed_call';
      callId: string;
      directConversationId: string;
      durationSeconds?: number;
    },
  ): Promise<void> {
    try {
      const tokens = await this.getUserFcmTokens(userId);

      await this.firebasePushService.sendCallStatusPush({
        tokens,
        ...payload,
      });
    } catch (error: unknown) {
      const message = this.getErrorMessage(error);
      this.logger.error(`Failed to send call status push: ${message}`);
    }
  }

  private async getUserFcmTokens(userId: string): Promise<string[]> {
    const devices =
      await this.userDeviceService.getActiveDevicesByUserId(userId);

    return devices
      .map((device) => device.fcmToken)
      .filter((token): token is string => Boolean(token?.trim()));
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error';
    }
  }

  private generateUid(): number {
    return Math.floor(Math.random() * (2 ** 32 - 1)) + 1;
  }
}
