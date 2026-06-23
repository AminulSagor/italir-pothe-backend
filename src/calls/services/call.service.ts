import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DirectConversation } from '../../chat/entities/direct-conversation.entity';
import { User } from '../../users/entities/user.entity';
import { InitiateCallDto } from '../dto/initiate-call.dto';
import { Call } from '../entities/call.entity';
import { CallStatus } from '../enums/call.enums';
import { CallAgoraTokenService } from './call-agora-token.service';

export interface ResolvedCallUsers {
  caller: User;
  receiver: User;
}

export interface CreateRingingCallResult {
  call: Call;
  created: boolean;
}

@Injectable()
export class CallService {
  private static readonly RINGING_TIMEOUT_MS = 60_000;

  constructor(
    @InjectRepository(Call)
    private readonly callRepository: Repository<Call>,

    @InjectRepository(DirectConversation)
    private readonly directConversationRepository: Repository<DirectConversation>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly callAgoraTokenService: CallAgoraTokenService,
  ) {}

  async resolveUsers(
    directConversationId: string,
    callerId: string,
  ): Promise<ResolvedCallUsers> {
    const directConversation = await this.directConversationRepository.findOne({
      where: {
        conversationId: directConversationId,
      },
    });

    if (!directConversation) {
      throw new NotFoundException({
        code: 'DIRECT_CONVERSATION_NOT_FOUND',
        message: 'Direct conversation not found',
      });
    }

    const callerIsUserOne = directConversation.userOneId === callerId;

    const callerIsUserTwo = directConversation.userTwoId === callerId;

    if (!callerIsUserOne && !callerIsUserTwo) {
      throw new ForbiddenException({
        code: 'NOT_CONVERSATION_MEMBER',
        message: 'You are not a member of this conversation',
      });
    }

    const receiverId = callerIsUserOne
      ? directConversation.userTwoId
      : directConversation.userOneId;

    const [caller, receiver] = await Promise.all([
      this.userRepository.findOne({
        where: {
          id: callerId,
        },
      }),

      this.userRepository.findOne({
        where: {
          id: receiverId,
        },
      }),
    ]);

    if (!caller || !receiver) {
      throw new NotFoundException({
        code: 'CALL_USER_NOT_FOUND',
        message: 'Caller or receiver was not found',
      });
    }

    return {
      caller,
      receiver,
    };
  }

  async createRingingCall(params: {
    caller: User;
    receiver: User;
    dto: InitiateCallDto;
  }): Promise<CreateRingingCallResult> {
    /*
     * Prevent an abandoned ringing call from
     * blocking both users forever.
     */
    await this.expireStaleRingingCalls();

    if (params.dto.clientCallId) {
      const existingCall = await this.callRepository.findOne({
        where: {
          callerId: params.caller.id,
          clientCallId: params.dto.clientCallId,
        },
        relations: {
          caller: true,
          receiver: true,
        },
      });

      if (existingCall) {
        return {
          call: existingCall,
          created: false,
        };
      }
    }

    await this.assertUsersAreNotBusy(params.caller.id, params.receiver.id);

    const callerAgoraUid = this.callAgoraTokenService.createAgoraUid();

    let receiverAgoraUid = this.callAgoraTokenService.createAgoraUid();

    while (receiverAgoraUid === callerAgoraUid) {
      receiverAgoraUid = this.callAgoraTokenService.createAgoraUid();
    }

    const call = this.callRepository.create({
      directConversationId: params.dto.directConversationId,

      callerId: params.caller.id,
      receiverId: params.receiver.id,

      callType: params.dto.callType,
      status: CallStatus.RINGING,

      agoraChannelName: this.callAgoraTokenService.createChannelName(),

      callerAgoraUid,
      receiverAgoraUid,

      clientCallId: params.dto.clientCallId ?? null,
    });

    const savedCall = await this.callRepository.save(call);

    savedCall.caller = params.caller;
    savedCall.receiver = params.receiver;

    return {
      call: savedCall,
      created: true,
    };
  }

  async answerRingingCall(callId: string, userId: string): Promise<Call> {
    const call = await this.findCallOrFail(callId);

    if (call.receiverId !== userId) {
      throw new ForbiddenException({
        code: 'ONLY_RECEIVER_CAN_ANSWER',
        message: 'Only the receiver can answer this call',
      });
    }

    if (call.status === CallStatus.ACTIVE) {
      return call;
    }

    if (call.status !== CallStatus.RINGING) {
      throw new ConflictException({
        code: 'CALL_CANNOT_BE_ANSWERED',
        message: `A call with status "${call.status}" cannot be answered`,
      });
    }

    call.status = CallStatus.ACTIVE;

    return this.callRepository.save(call);
  }

  async rejectRingingCall(callId: string, userId: string): Promise<Call> {
    const call = await this.findCallOrFail(callId);

    if (call.receiverId !== userId) {
      throw new ForbiddenException({
        code: 'ONLY_RECEIVER_CAN_REJECT',
        message: 'Only the receiver can reject this call',
      });
    }

    if (call.status === CallStatus.REJECTED) {
      return call;
    }

    if (call.status !== CallStatus.RINGING) {
      throw new ConflictException({
        code: 'CALL_CANNOT_BE_REJECTED',
        message: `A call with status "${call.status}" cannot be rejected`,
      });
    }

    call.status = CallStatus.REJECTED;

    return this.callRepository.save(call);
  }

  /**
   * The caller can cancel only while the call is ringing.
   */
  async cancelRingingCall(callId: string, userId: string): Promise<Call> {
    const call = await this.findCallOrFail(callId);

    if (call.callerId !== userId) {
      throw new ForbiddenException({
        code: 'ONLY_CALLER_CAN_CANCEL',
        message: 'Only the caller can cancel a ringing call',
      });
    }

    /*
     * Make cancellation idempotent.
     * Repeated requests return the same call.
     */
    if (call.status === CallStatus.CANCELLED) {
      return call;
    }

    if (call.status !== CallStatus.RINGING) {
      throw new ConflictException({
        code: 'CALL_CANNOT_BE_CANCELLED',
        message: `A call with status "${call.status}" cannot be cancelled`,
      });
    }

    call.status = CallStatus.CANCELLED;

    return this.callRepository.save(call);
  }

  /**
   * Either participant can end an active call.
   */
  async endCall(callId: string, userId: string): Promise<Call> {
    const call = await this.findCallOrFail(callId);

    this.assertCallParticipant(call, userId);

    /*
     * Make ending the call idempotent.
     */
    if (call.status === CallStatus.ENDED) {
      return call;
    }

    if (call.status !== CallStatus.ACTIVE) {
      throw new ConflictException({
        code: 'CALL_CANNOT_BE_ENDED',
        message: `A call with status "${call.status}" cannot be ended`,
      });
    }

    call.status = CallStatus.ENDED;

    return this.callRepository.save(call);
  }

  async deleteCall(callId: string): Promise<void> {
    await this.callRepository.delete(callId);
  }

  private async findCallOrFail(callId: string): Promise<Call> {
    const call = await this.callRepository.findOne({
      where: {
        id: callId,
      },
      relations: {
        caller: true,
        receiver: true,
      },
    });

    if (!call) {
      throw new NotFoundException({
        code: 'CALL_NOT_FOUND',
        message: 'Call not found',
      });
    }

    return call;
  }

  private assertCallParticipant(call: Call, userId: string): void {
    const isParticipant =
      call.callerId === userId || call.receiverId === userId;

    if (!isParticipant) {
      throw new ForbiddenException({
        code: 'NOT_CALL_PARTICIPANT',
        message: 'You are not a participant of this call',
      });
    }
  }

  private async expireStaleRingingCalls(): Promise<void> {
    const staleBefore = new Date(Date.now() - CallService.RINGING_TIMEOUT_MS);

    await this.callRepository
      .createQueryBuilder()
      .update(Call)
      .set({
        status: CallStatus.MISSED,
      })
      .where('"status" = :status', {
        status: CallStatus.RINGING,
      })
      .andWhere('"createdAt" < :staleBefore', {
        staleBefore,
      })
      .execute();
  }

  private async assertUsersAreNotBusy(
    callerId: string,
    receiverId: string,
  ): Promise<void> {
    const busyCall = await this.callRepository
      .createQueryBuilder('call')
      .where('call.status IN (:...statuses)', {
        statuses: [CallStatus.RINGING, CallStatus.ACTIVE],
      })
      .andWhere(
        `
          (
            call.callerId IN (:...userIds)
            OR
            call.receiverId IN (:...userIds)
          )
        `,
        {
          userIds: [callerId, receiverId],
        },
      )
      .getOne();

    if (!busyCall) {
      return;
    }

    const callerIsBusy =
      busyCall.callerId === callerId || busyCall.receiverId === callerId;

    throw new ConflictException({
      code: callerIsBusy ? 'CALLER_BUSY' : 'RECEIVER_BUSY',

      message: callerIsBusy
        ? 'You already have an ongoing call'
        : 'The receiver is busy on another call',
    });
  }
}
