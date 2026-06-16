import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { BatchResponse, getMessaging } from 'firebase-admin/messaging';

type PushDataValue = string | number | boolean | null | undefined;
type PushData = Record<string, PushDataValue>;

@Injectable()
export class FirebasePushService implements OnModuleInit {
  private readonly logger = new Logger(FirebasePushService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.initializeFirebase();
  }

  private initializeFirebase(): void {
    if (getApps().length > 0) {
      return;
    }

    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.configService
      .get<string>('FIREBASE_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('Firebase Admin env values are missing');
      return;
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });

    this.logger.log('Firebase Admin initialized successfully');
  }

  async sendDataToToken(token: string, data: PushData): Promise<string> {
    if (!token?.trim()) {
      throw new InternalServerErrorException('FCM token is required');
    }

    this.ensureFirebaseInitialized();

    return getMessaging().send({
      token,
      data: this.normalizeData(data),
      android: {
        priority: 'high',
        ttl: 30 * 1000,
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: {
            contentAvailable: true,
            sound: 'default',
          },
        },
      },
    });
  }

  async sendDataToTokens(
    tokens: string[],
    data: PushData,
  ): Promise<BatchResponse | null> {
    const validTokens = [...new Set(tokens.filter((token) => token?.trim()))];

    if (validTokens.length === 0) {
      this.logger.warn('No valid FCM tokens found');
      return null;
    }

    this.ensureFirebaseInitialized();

    const response = await getMessaging().sendEachForMulticast({
      tokens: validTokens,
      data: this.normalizeData(data),
      android: {
        priority: 'high',
        ttl: 30 * 1000,
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: {
            contentAvailable: true,
            sound: 'default',
          },
        },
      },
    });

    this.logger.log(
      `Push sent. success=${response.successCount}, failed=${response.failureCount}`,
    );

    return response;
  }

  async sendIncomingCallPush(params: {
    tokens: string[];
    callId: string;
    directConversationId: string;
    callerId: string;
    callerName?: string | null;
    callerAvatarUrl?: string | null;
    callType: 'audio' | 'video';
    agoraChannelName?: string | null;
  }): Promise<BatchResponse | null> {
    return this.sendDataToTokens(params.tokens, {
      type: 'incoming_call',
      callId: params.callId,
      directConversationId: params.directConversationId,
      callerId: params.callerId,
      callerName: params.callerName ?? '',
      callerAvatarUrl: params.callerAvatarUrl ?? '',
      callType: params.callType,
      agoraChannelName: params.agoraChannelName ?? '',
    });
  }

  async sendCallStatusPush(params: {
    tokens: string[];
    type: 'call_accepted' | 'call_rejected' | 'call_ended' | 'missed_call';
    callId: string;
    directConversationId: string;
    durationSeconds?: number;
  }): Promise<BatchResponse | null> {
    return this.sendDataToTokens(params.tokens, {
      type: params.type,
      callId: params.callId,
      directConversationId: params.directConversationId,
      durationSeconds: params.durationSeconds ?? 0,
    });
  }

  private ensureFirebaseInitialized(): void {
    if (getApps().length === 0) {
      this.initializeFirebase();
    }

    if (getApps().length === 0) {
      throw new InternalServerErrorException(
        'Firebase Admin is not initialized',
      );
    }
  }

  private normalizeData(data: PushData): Record<string, string> {
    return Object.entries(data).reduce<Record<string, string>>(
      (normalized, [key, value]) => {
        normalized[key] =
          value === null || value === undefined ? '' : String(value);
        return normalized;
      },
      {},
    );
  }
}
