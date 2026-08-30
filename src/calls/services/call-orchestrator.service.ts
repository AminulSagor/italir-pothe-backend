import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { UserBlocksService } from '../../user-blocks/user-blocks.service';
import { InitiateCallDto } from '../dto/initiate-call.dto';
import { Call } from '../entities/call.entity';
import { CallAgoraTokenService } from './call-agora-token.service';
import { CallRealtimeService } from './call-realtime.service';
import { CallService } from './call.service';
import { UserDeviceService } from 'src/devices/services/user-device.service';
import { FirebaseAdminService } from 'src/firebase/services/firebase-admin.service';
import { DevicePlatform } from 'src/devices/enums/device.enums';
import { CallStatus } from '../enums/call.enums';
import { AppleVoipPushService } from './apple-voip-push.service';

interface PendingIncomingAck {
  receiverId: string;
  resolve: (acknowledged: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
}

@Injectable()
export class CallOrchestratorService implements OnModuleDestroy {
  private readonly logger = new Logger(CallOrchestratorService.name);
  private readonly incomingAckTimeoutMs = 2000;
  private readonly ringingTimeoutMs = 60_000;

  private readonly pendingIncomingAcks = new Map<string, PendingIncomingAck>();
  private readonly ringingTimeouts = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly callService: CallService,
    private readonly userBlocksService: UserBlocksService,
    private readonly callRealtimeService: CallRealtimeService,
    private readonly callAgoraTokenService: CallAgoraTokenService,
    private readonly userDeviceService: UserDeviceService,
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly appleVoipPushService: AppleVoipPushService,
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

    this.scheduleRingingTimeout(call);

    let socketDelivered = false;
    const foregroundAcknowledged = false;

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

      this.logger.log('Incoming call socket dispatch completed', {
        callId: call.id,
        callerId: caller.id,
        receiverId: receiver.id,
        socketDelivered,
        ackTimeoutMs: this.incomingAckTimeoutMs,
      });

      if (!socketDelivered) {
        /*
         * Resolve immediately because there is no connected
         * receiver socket that can acknowledge the event.
         */
        this.resolveIncomingAcknowledgement(call.id, false);
      }

      // Return the call ID to the caller immediately. The ACK/push fallback
      // continues independently so a first-frame hangup can cancel the call
      // instead of waiting several seconds for APNs.
      void this.dispatchIncomingPushAfterAcknowledgement({
        ackPromise,
        call,
        callerId: caller.id,
        callerName: caller.fullName,
        callerAvatarUrl: caller.avatarUrl ?? '',
        receiverId: receiver.id,
      });
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

  private async dispatchIncomingPushAfterAcknowledgement(params: {
    ackPromise: Promise<boolean>;
    call: Call;
    callerId: string;
    callerName: string;
    callerAvatarUrl: string;
    receiverId: string;
  }): Promise<void> {
    try {
      const foregroundAcknowledged = await params.ackPromise;
      this.logger.log('Incoming call acknowledgement window completed', {
        callId: params.call.id,
        receiverId: params.receiverId,
        foregroundAcknowledged,
      });

      if (foregroundAcknowledged) {
        this.logger.log(
          'Incoming call push skipped because a receiver acknowledged the socket event',
          {
            callId: params.call.id,
            receiverId: params.receiverId,
          },
        );
        return;
      }

      const latestCall = await this.callService.findCallById(params.call.id);
      if (latestCall?.status !== CallStatus.RINGING) {
        this.logger.log(
          'Incoming call push skipped because call is not ringing',
          {
            callId: params.call.id,
            status: latestCall?.status ?? null,
          },
        );
        return;
      }

      const devices = await this.userDeviceService.getActiveDevicesByUserId(
        params.receiverId,
      );
      const voipTokens = devices
        .filter(
          (device) =>
            device.platform === DevicePlatform.IOS &&
            Boolean(device.voipToken?.trim()),
        )
        .map((device) => device.voipToken!.trim());
      const fcmTokens = devices
        .filter(
          (device) =>
            device.platform !== DevicePlatform.IOS || !device.voipToken,
        )
        .map((device) => device.fcmToken)
        .filter(
          (token): token is string =>
            typeof token === 'string' && token.trim().length > 0,
        );

      this.logger.log('Preparing incoming call push', {
        callId: params.call.id,
        receiverId: params.receiverId,
        activeDeviceCount: devices.length,
        fcmTokensCount: fcmTokens.length,
        voipTokensCount: voipTokens.length,
        devices: devices.map((device) => ({
          deviceIdSuffix: device.deviceId.slice(-8),
          platform: device.platform,
          appState: device.appState,
          hasFcmToken: Boolean(device.fcmToken?.trim()),
          hasVoipToken: Boolean(device.voipToken?.trim()),
          voipTokenLength: device.voipToken?.trim().length ?? 0,
          updatedAt: device.updatedAt,
        })),
      });

      if (voipTokens.length === 0) {
        this.logger.warn('No active iOS VoIP token found for incoming call', {
          callId: params.call.id,
          receiverId: params.receiverId,
          activeDeviceCount: devices.length,
        });
      }

      const pushData = {
        callId: params.call.id,
        conversationId: params.call.directConversationId,
        callType: params.call.callType,
        callerId: params.callerId,
        callerName: params.callerName,
        callerAvatarUrl: params.callerAvatarUrl,
      };

      const [, voipResults] = await Promise.all([
        fcmTokens.length > 0
          ? this.firebaseAdminService.sendDataToTokens({
              tokens: fcmTokens,
              data: {
                type: 'incoming_call',
                ...pushData,
              },
            })
          : Promise.resolve(),
        this.appleVoipPushService.sendIncomingCall(voipTokens, pushData),
      ]);

      const invalidVoipTokens = voipResults.filter((result) =>
        ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'].includes(
          result.reason ?? '',
        ),
      );

      await Promise.all(
        invalidVoipTokens.map((result) =>
          this.userDeviceService.deactivateByVoipToken(result.token),
        ),
      );

      const failedVoipCount = voipResults.filter(
        (result) => !result.success,
      ).length;

      this.logger.log('Incoming call push dispatch completed', {
        callId: params.call.id,
        receiverId: params.receiverId,
        voipResults: voipResults.map((result) => ({
          success: result.success,
          status: result.status,
          reason: result.reason,
        })),
      });
      if (failedVoipCount > 0) {
        this.logger.warn('Some APNs VoIP pushes failed', {
          callId: params.call.id,
          failedCount: failedVoipCount,
          totalCount: voipResults.length,
        });
      }
    } catch (error) {
      this.logger.error('Unable to dispatch incoming call push', {
        callId: params.call.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getCall(userId: string, callId: string) {
    const call = await this.callService.getParticipantCall(callId, userId);

    return {
      call: this.presentCall(call),
    };
  }

  async acknowledgeIncoming(userId: string, callId: string) {
    const normalizedCallId = callId.trim();

    // Validate using the database so acknowledgements can still work
    // after the temporary 2-second foreground ACK waiter expires.
    const call = await this.callService.getParticipantCall(
      normalizedCallId,
      userId,
    );

    if (call.receiverId !== userId) {
      throw new ConflictException({
        code: 'CALL_ACK_FORBIDDEN',
        message: 'Only the call receiver can acknowledge this incoming call',
      });
    }

    // Resolve the foreground waiter when it still exists.
    this.resolveIncomingAcknowledgement(normalizedCallId, true);

    // Do not tell the caller it is ringing if the call has already
    // been answered, rejected, cancelled, missed, or ended.
    if (call.status !== CallStatus.RINGING) {
      return {
        callId: normalizedCallId,
        acknowledged: false,
        status: call.status,
      };
    }

    // Receiver device has now displayed/started ringing the call.
    this.callRealtimeService.emitToUser(call.callerId, 'call:ringing', {
      call: this.presentCall(call),
      acknowledgedBy: userId,
    });

    return {
      callId: normalizedCallId,
      acknowledged: true,
      status: call.status,
    };
  }

  async answer(userId: string, callId: string) {
    /*
     * Remove any pending ACK waiter because answering
     * proves that the receiver handled the call.
     */
    this.resolveIncomingAcknowledgement(callId, true);

    const call = await this.callService.answerRingingCall(callId, userId);
    this.clearRingingTimeout(callId);

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
    this.clearRingingTimeout(callId);

    this.callRealtimeService.emitToUser(call.callerId, 'call:rejected', {
      call: this.presentCall(call),
      rejectedBy: userId,
    });

    await this.sendCallTerminationPush({
      userId: call.callerId,
      callId: call.id,
      type: 'call_rejected',
    });

    return {
      call: this.presentCall(call),
    };
  }

  async cancel(userId: string, callId: string) {
    this.resolveIncomingAcknowledgement(callId, false);

    const call = await this.callService.cancelRingingCall(callId, userId);
    this.clearRingingTimeout(callId);

    this.callRealtimeService.emitToUser(call.receiverId, 'call:cancelled', {
      call: this.presentCall(call),
      cancelledBy: userId,
    });

    await this.sendCallTerminationPush({
      userId: call.receiverId,
      callId: call.id,
      type: 'call_cancelled',
    });

    return {
      call: this.presentCall(call),
    };
  }

  async timeout(userId: string, callId: string) {
    this.resolveIncomingAcknowledgement(callId, false);

    const result = await this.callService.timeoutRingingCall(callId, userId);
    this.clearRingingTimeout(callId);

    if (result.changed) {
      await this.notifyMissedCall(result.call);
    }

    return {
      call: this.presentCall(result.call),
    };
  }

  private scheduleRingingTimeout(call: Call): void {
    if (call.status !== CallStatus.RINGING) {
      return;
    }

    this.clearRingingTimeout(call.id);

    const createdAtMs = new Date(call.createdAt).getTime();
    const elapsedMs = Number.isFinite(createdAtMs)
      ? Math.max(0, Date.now() - createdAtMs)
      : 0;
    const delayMs = Math.max(0, this.ringingTimeoutMs - elapsedMs);

    const timeout = setTimeout(() => {
      void this.timeoutFromServer(call.id);
    }, delayMs);

    this.ringingTimeouts.set(call.id, timeout);
  }

  private async timeoutFromServer(callId: string): Promise<void> {
    this.ringingTimeouts.delete(callId);
    this.resolveIncomingAcknowledgement(callId, false);

    try {
      const result = await this.callService.timeoutRingingCall(callId);
      if (result.changed) {
        await this.notifyMissedCall(result.call);
      }
    } catch (error) {
      console.error('[CallTimeout] Unable to expire ringing call', {
        callId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async notifyMissedCall(call: Call): Promise<void> {
    const payload = {
      call: this.presentCall(call),
      reason: 'timeout',
    };

    this.callRealtimeService.emitToUser(call.callerId, 'call:ended', payload);
    this.callRealtimeService.emitToUser(call.receiverId, 'call:ended', payload);

    await Promise.all([
      this.sendCallTerminationPush({
        userId: call.callerId,
        callId: call.id,
        type: 'call_ended',
      }),
      this.sendCallTerminationPush({
        userId: call.receiverId,
        callId: call.id,
        type: 'call_ended',
      }),
    ]);
  }

  private clearRingingTimeout(callId: string): void {
    const timeout = this.ringingTimeouts.get(callId);
    if (!timeout) {
      return;
    }

    clearTimeout(timeout);
    this.ringingTimeouts.delete(callId);
  }

  onModuleDestroy(): void {
    for (const timeout of this.ringingTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.ringingTimeouts.clear();

    for (const pending of this.pendingIncomingAcks.values()) {
      clearTimeout(pending.timeout);
      pending.resolve(false);
    }
    this.pendingIncomingAcks.clear();
  }

  private async sendCallTerminationPush(params: {
    userId: string;
    callId: string;
    type: 'call_cancelled' | 'call_rejected' | 'call_ended';
  }): Promise<void> {
    const devices = await this.userDeviceService.findActiveFcmDevicesByUsers([
      params.userId,
    ]);

    const tokens = devices
      .map((device) => device.fcmToken)
      .filter(
        (token): token is string =>
          typeof token === 'string' && token.trim().length > 0,
      );

    if (tokens.length === 0) {
      return;
    }

    await this.firebaseAdminService.sendDataToTokens({
      tokens,
      data: {
        type: params.type,
        callId: params.callId,
      },
    });
  }

  async end(userId: string, callId: string) {
    this.resolveIncomingAcknowledgement(callId, false);

    const call = await this.callService.endCall(callId, userId);
    this.clearRingingTimeout(callId);

    const otherUserId = this.getOtherUserId(call, userId);

    this.callRealtimeService.emitToUser(otherUserId, 'call:ended', {
      call: this.presentCall(call),
      endedBy: userId,
    });

    await this.sendCallTerminationPush({
      userId: otherUserId,
      callId: call.id,
      type: 'call_ended',
    });

    return {
      call: this.presentCall(call),
    };
  }

  async heartbeat(userId: string, callId: string) {
    const call = await this.callService.heartbeatActiveCall(callId, userId);
    return {
      call: this.presentCall(call),
    };
  }

  @Cron('*/30 * * * * *', {
    name: 'expire-stale-active-calls',
  })
  async expireStaleActiveCalls(): Promise<void> {
    const calls = await this.callService.expireStaleActiveCalls();
    if (calls.length === 0) {
      return;
    }

    this.logger.warn(`Expired ${calls.length} stale active call(s)`);
    await Promise.all(
      calls.map(async (call) => {
        const payload = {
          call: this.presentCall(call),
          reason: 'heartbeat_timeout',
        };
        this.callRealtimeService.emitToUser(
          call.callerId,
          'call:ended',
          payload,
        );
        this.callRealtimeService.emitToUser(
          call.receiverId,
          'call:ended',
          payload,
        );
        await Promise.all([
          this.sendCallTerminationPush({
            userId: call.callerId,
            callId: call.id,
            type: 'call_ended',
          }),
          this.sendCallTerminationPush({
            userId: call.receiverId,
            callId: call.id,
            type: 'call_ended',
          }),
        ]);
      }),
    );
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
      lastHeartbeatAt: call.lastHeartbeatAt,
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
