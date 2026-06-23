import { ConflictException, Injectable } from '@nestjs/common';

import { UserBlocksService } from '../../user-blocks/user-blocks.service';
import { InitiateCallDto } from '../dto/initiate-call.dto';
import { Call } from '../entities/call.entity';
import { CallAgoraTokenService } from './call-agora-token.service';
import { CallRealtimeService } from './call-realtime.service';
import { CallService } from './call.service';

@Injectable()
export class CallOrchestratorService {
  constructor(
    private readonly callService: CallService,
    private readonly userBlocksService: UserBlocksService,
    private readonly callRealtimeService: CallRealtimeService,
    private readonly callAgoraTokenService: CallAgoraTokenService,
  ) {}

  async initiate(callerId: string, dto: InitiateCallDto) {
    const { caller, receiver } = await this.callService.resolveUsers(
      dto.directConversationId,
      callerId,
    );

    await this.userBlocksService.assertCanMessage(caller.id, receiver.id);

    if (!this.callRealtimeService.isUserConnected(receiver.id)) {
      throw new ConflictException({
        code: 'RECEIVER_NOT_FOREGROUND',
        message: 'The receiver is not connected to the foreground call socket',
      });
    }

    const { call, created } = await this.callService.createRingingCall({
      caller,
      receiver,
      dto,
    });

    if (created) {
      const delivered = this.callRealtimeService.emitToUser(
        receiver.id,
        'call:incoming',
        {
          call: this.presentCall(call),
          caller: this.presentUser(caller),
        },
      );

      if (!delivered) {
        await this.callService.deleteCall(call.id);

        throw new ConflictException({
          code: 'RECEIVER_DISCONNECTED',
          message: 'The receiver disconnected before the call was delivered',
        });
      }
    }

    const media = this.callAgoraTokenService.buildPublisherToken({
      channelName: call.agoraChannelName,
      uid: call.callerAgoraUid,
    });

    return {
      call: this.presentCall(call),
      receiver: this.presentUser(receiver),
      media,
      created,
    };
  }

  async answer(userId: string, callId: string) {
    const call = await this.callService.answerRingingCall(callId, userId);

    const media = this.callAgoraTokenService.buildPublisherToken({
      channelName: call.agoraChannelName,
      uid: call.receiverAgoraUid,
    });

    this.callRealtimeService.emitToUser(call.callerId, 'call:answered', {
      call: this.presentCall(call),
      answeredBy: userId,
    });

    return {
      call: this.presentCall(call),
      media,
      created: false,
    };
  }

  async reject(userId: string, callId: string) {
    const call = await this.callService.rejectRingingCall(callId, userId);

    this.callRealtimeService.emitToUser(call.callerId, 'call:rejected', {
      call: this.presentCall(call),
      rejectedBy: userId,
    });

    return {
      call: this.presentCall(call),
    };
  }

  async cancel(userId: string, callId: string) {
    const call = await this.callService.cancelRingingCall(callId, userId);

    this.callRealtimeService.emitToUser(call.receiverId, 'call:cancelled', {
      call: this.presentCall(call),
      cancelledBy: userId,
    });

    return {
      call: this.presentCall(call),
    };
  }

  async end(userId: string, callId: string) {
    const call = await this.callService.endCall(callId, userId);

    const otherUserId = this.getOtherUserId(call, userId);

    this.callRealtimeService.emitToUser(otherUserId, 'call:ended', {
      call: this.presentCall(call),
      endedBy: userId,
    });

    return {
      call: this.presentCall(call),
    };
  }

  private getOtherUserId(call: Call, currentUserId: string): string {
    return call.callerId === currentUserId ? call.receiverId : call.callerId;
  }

  private presentCall(call: Call) {
    return {
      id: call.id,
      directConversationId: call.directConversationId,

      callerId: call.callerId,
      receiverId: call.receiverId,

      callType: call.callType,
      status: call.status,

      receiverAgoraUid: call.receiverAgoraUid,

      createdAt: call.createdAt,
      updatedAt: call.updatedAt,
    };
  }

  private presentUser(user: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    profilePhotoFileId: string | null;
  }) {
    return {
      id: user.id,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      profilePhotoFileId: user.profilePhotoFileId,
    };
  }
}
