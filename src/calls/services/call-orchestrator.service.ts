import { ConflictException, Injectable } from '@nestjs/common';

import { UserBlocksService } from '../../user-blocks/user-blocks.service';
import { InitiateCallDto } from '../dto/initiate-call.dto';
import { Call } from '../entities/call.entity';
import { CallAgoraTokenService } from './call-agora-token.service';
import { CallRealtimeService } from './call-realtime.service';
import { CallService } from './call.service';
import { UserDeviceService } from 'src/devices/services/user-device.service';
import { FirebaseAdminService } from 'src/firebase/services/firebase-admin.service';
import { CallStatus } from '../enums/call.enums';

interface PendingIncomingAck {
  receiverId: string;
  resolve: (acknowledged: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
}

@Injectable()
export class CallOrchestratorService {
  private readonly incomingAckTimeoutMs = 2000;

  private readonly pendingIncomingAcks = new Map<string, PendingIncomingAck>();

  constructor(
    private readonly callService: CallService,
    private readonly userBlocksService: UserBlocksService,
    private readonly callRealtimeService: CallRealtimeService,
    private readonly callAgoraTokenService: CallAgoraTokenService,
    private readonly userDeviceService: UserDeviceService,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  async initiate(callerId: string, dto: InitiateCallDto) {
    const { caller, receiver } = await this.callService.resolveUsers(
      dto.directConversationId,
      callerId,
    );

    await this.userBlocksService.assertCanMessage(caller.id, receiver.id);

    /*
     * Do not reject when the receiver socket is disconnected.
     *
     * If the receiver does not ACK the socket event,
     * the next phase will send an FCM call notification.
     */
    const { call, created } = await this.callService.createRingingCall({
      caller,
      receiver,
      dto,
    });

    let socketDelivered = false;
    let foregroundAcknowledged = false;

    if (created) {
      /*
       * Register the ACK waiter before emitting the event.
       * This prevents a very fast Flutter ACK from being missed.
       */
      const ackPromise = this.waitForIncomingAcknowledgement({
        callId: call.id,
        receiverId: receiver.id,
      });

      socketDelivered = this.callRealtimeService.emitToUser(
        receiver.id,
        'call:incoming',
        {
          call: this.presentCall(call),
          caller: this.presentUser(caller),
        },
      );

      if (!socketDelivered) {
        /*
         * Resolve immediately because there is no connected
         * receiver socket that can acknowledge the event.
         */
        this.resolveIncomingAcknowledgement(call.id, false);
      }

      foregroundAcknowledged = await ackPromise;

      if (!foregroundAcknowledged) {
        const latestCall = await this.callService.findCallById(call.id);

        if (latestCall?.status === CallStatus.RINGING) {
          const devices =
            await this.userDeviceService.findActiveFcmDevicesByUsers([
              receiver.id,
            ]);

          const tokens = devices
            .map((device) => device.fcmToken)
            .filter(
              (token): token is string =>
                typeof token === 'string' && token.trim().length > 0,
            );

          console.log('[CallPush] preparing incoming call push', {
            callId: call.id,
            receiverId: receiver.id,
            tokensCount: tokens.length,
          });

          if (tokens.length > 0) {
            await this.firebaseAdminService.sendDataToTokens({
              tokens,
              data: {
                type: 'incoming_call',
                callId: call.id,
                conversationId: call.directConversationId,
                callType: call.callType,
                callerId: caller.id,
                callerName: caller.fullName,
                callerAvatarUrl: caller.avatarUrl ?? '',
              },
            });

            console.log('[CallPush] incoming call push sent', {
              callId: call.id,
              receiverId: receiver.id,
            });
          }
        } else {
          console.log('[CallPush] skipped because call is not ringing', {
            callId: call.id,
            status: latestCall?.status ?? null,
          });
        }
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
      socketDelivered,
      foregroundAcknowledged,
    };
  }

  async acknowledgeIncoming(userId: string, callId: string) {
    const normalizedCallId = callId.trim();

    const pending = this.pendingIncomingAcks.get(normalizedCallId);

    if (!pending) {
      throw new ConflictException({
        code: 'CALL_ACK_NOT_PENDING',
        message: 'The incoming-call acknowledgement window has expired',
      });
    }

    if (pending.receiverId !== userId) {
      throw new ConflictException({
        code: 'CALL_ACK_FORBIDDEN',
        message: 'Only the call receiver can acknowledge this incoming call',
      });
    }

    this.resolveIncomingAcknowledgement(normalizedCallId, true);

    return {
      callId: normalizedCallId,
      acknowledged: true,
    };
  }

  async answer(userId: string, callId: string) {
    /*
     * Remove any pending ACK waiter because answering
     * proves that the receiver handled the call.
     */
    this.resolveIncomingAcknowledgement(callId, true);

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
    this.resolveIncomingAcknowledgement(callId, true);

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
    this.resolveIncomingAcknowledgement(callId, false);

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
    this.resolveIncomingAcknowledgement(callId, false);

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

  private waitForIncomingAcknowledgement({
    callId,
    receiverId,
  }: {
    callId: string;
    receiverId: string;
  }): Promise<boolean> {
    /*
     * Clear an old waiter if the same call ID somehow
     * registered more than once.
     */
    this.resolveIncomingAcknowledgement(callId, false);

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        const current = this.pendingIncomingAcks.get(callId);

        if (!current) {
          return;
        }

        this.pendingIncomingAcks.delete(callId);

        resolve(false);
      }, this.incomingAckTimeoutMs);

      this.pendingIncomingAcks.set(callId, {
        receiverId,
        resolve,
        timeout,
      });
    });
  }

  private resolveIncomingAcknowledgement(
    callId: string,
    acknowledged: boolean,
  ): void {
    const normalizedCallId = callId.trim();

    const pending = this.pendingIncomingAcks.get(normalizedCallId);

    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);

    this.pendingIncomingAcks.delete(normalizedCallId);

    pending.resolve(acknowledged);
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
