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
import { AgoraTokenService } from '../../webinar/services/agora-token.service';
import { AgoraLiveRole } from '../../webinar/services/agora-token.service';

@Injectable()
export class CallService {
  private readonly logger = new Logger(CallService.name);

  constructor(
    @InjectRepository(Call)
    private callRepo: Repository<Call>,
    @InjectRepository(DirectConversation)
    private directConversationRepo: Repository<DirectConversation>,
    private agoraTokenService: AgoraTokenService,
  ) {}

  async initiateCall(params: {
    directConversationId: string;
    callerId: string;
    recipientId: string;
    callType: CallType;
  }) {
    try {
      const directConversation = await this.directConversationRepo.findOne({
        where: { id: params.directConversationId },
        relations: ['userOne', 'userTwo'],
      });

      if (!directConversation) {
        throw new NotFoundException('Conversation not found');
      }

      // Check if a call is already active
      const activeCall = await this.callRepo.findOne({
        where: {
          directConversationId: params.directConversationId,
          status: CallStatus.ACTIVE,
        },
      });

      if (activeCall) {
        throw new ConflictException('An active call already exists');
      }

      // Check if there's a pending call
      const pendingCall = await this.callRepo.findOne({
        where: {
          directConversationId: params.directConversationId,
          status: CallStatus.PENDING,
        },
      });

      if (pendingCall) {
        throw new ConflictException('A pending call already exists');
      }

      const channelName = `call_${params.directConversationId}`;
      const callerUid = this.generateUid();
      const recipientUid = this.generateUid();

      const call = this.callRepo.create({
        directConversationId: params.directConversationId,
        callerId: params.callerId,
        recipientId: params.recipientId,
        callType: params.callType,
        agoraChannelName: channelName,
        callerAgoraUid: callerUid,
        recipientAgoraUid: recipientUid,
        status: CallStatus.PENDING,
      });

      const savedCall = await this.callRepo.save(call);
      this.logger.log(`Call initiated: ${savedCall.id}`);

      return savedCall;
    } catch (error) {
      this.logger.error(`Failed to initiate call: ${error.message}`);
      throw error;
    }
  }

  async answerCall(callId: string, recipientId: string) {
    try {
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
    } catch (error) {
      this.logger.error(`Failed to answer call: ${error.message}`);
      throw error;
    }
  }

  async rejectCall(callId: string, recipientId: string) {
    try {
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
    } catch (error) {
      this.logger.error(`Failed to reject call: ${error.message}`);
      throw error;
    }
  }

  async endCall(callId: string, userId: string) {
    try {
      const call = await this.callRepo.findOne({ where: { id: callId } });

      if (!call) {
        throw new NotFoundException('Call not found');
      }

      if (call.callerId !== userId && call.recipientId !== userId) {
        throw new BadRequestException('Not authorized to end this call');
      }

      if (call.status === CallStatus.ENDED) {
        return call; // Already ended
      }

      call.status = CallStatus.ENDED;
      call.endedAt = new Date();

      // Calculate duration only if call was answered
      if (call.answeredAt) {
        const durationMs =
          call.endedAt.getTime() - call.answeredAt.getTime();
        call.durationSeconds = Math.floor(durationMs / 1000);
      }

      const savedCall = await this.callRepo.save(call);
      this.logger.log(
        `Call ended: ${callId}, Duration: ${savedCall.durationSeconds}s`,
      );

      return savedCall;
    } catch (error) {
      this.logger.error(`Failed to end call: ${error.message}`);
      throw error;
    }
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
      uid: uid,
      role: AgoraLiveRole.PUBLISHER,
    });
  }

  async getCallHistory(directConversationId: string, limit: number = 50) {
    try {
      return await this.callRepo.find({
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
    } catch (error) {
      this.logger.error(`Failed to get call history: ${error.message}`);
      throw error;
    }
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
    try {
      const missedCalls = await this.callRepo.find({
        where: {
          recipientId,
          status: CallStatus.PENDING,
        },
      });

      for (const call of missedCalls) {
        const now = new Date();
        // Mark as missed if initiated more than 2 minutes ago
        if (now.getTime() - call.initiatedAt.getTime() > 2 * 60 * 1000) {
          call.status = CallStatus.MISSED;
          call.endedAt = now;
          await this.callRepo.save(call);
        }
      }

      return missedCalls.length;
    } catch (error) {
      this.logger.error(`Failed to mark missed calls: ${error.message}`);
      throw error;
    }
  }

  private generateUid(): number {
    return Math.floor(Math.random() * (2 ** 32 - 1)) + 1;
  }
}
