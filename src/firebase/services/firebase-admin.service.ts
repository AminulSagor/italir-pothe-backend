import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, App } from 'firebase-admin/app';
import {
  getMessaging,
  Message,
  MulticastMessage,
} from 'firebase-admin/messaging';

export interface FirebaseSendResult {
  token: string;
  success: boolean;
  messageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

@Injectable()
export class FirebaseAdminService {
  private readonly logger = new Logger(FirebaseAdminService.name);
  private readonly firebaseApp: App | null;

  constructor(private readonly configService: ConfigService) {
    this.firebaseApp = this.initializeFirebaseApp();
  }

  async sendToToken(params: {
    token: string;
    title: string;
    body: string;
    imageUrl?: string | null;
    deepLink?: string | null;
  }): Promise<FirebaseSendResult> {
    const results = await this.sendToTokens({
      tokens: [params.token],
      title: params.title,
      body: params.body,
      imageUrl: params.imageUrl,
      deepLink: params.deepLink,
    });

    return results[0];
  }

  async sendToTokens(params: {
    tokens: string[];
    title: string;
    body: string;
    imageUrl?: string | null;
    deepLink?: string | null;
  }): Promise<FirebaseSendResult[]> {
    const uniqueTokens = Array.from(new Set(params.tokens)).filter(Boolean);

    if (uniqueTokens.length === 0) {
      return [];
    }

    if (!this.firebaseApp) {
      return uniqueTokens.map((token) => ({
        token,
        success: false,
        messageId: null,
        errorCode: 'firebase/not-configured',
        errorMessage: 'Firebase Admin SDK is not configured.',
      }));
    }

    const chunks = this.chunkArray(uniqueTokens, 500);
    const allResults: FirebaseSendResult[] = [];

    for (const chunk of chunks) {
      const message: MulticastMessage = {
        tokens: chunk,
        notification: {
          title: params.title,
          body: params.body,
          imageUrl: params.imageUrl ?? undefined,
        },
        data: {
          deepLink: params.deepLink ?? '',
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      };

      try {
        const response = await getMessaging(
          this.firebaseApp,
        ).sendEachForMulticast(message);

        response.responses.forEach((item, index) => {
          allResults.push({
            token: chunk[index],
            success: item.success,
            messageId: item.messageId ?? null,
            errorCode: item.error?.code ?? null,
            errorMessage: item.error?.message ?? null,
          });
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown Firebase error';

        this.logger.error(message);

        chunk.forEach((token) => {
          allResults.push({
            token,
            success: false,
            messageId: null,
            errorCode: 'firebase/send-failed',
            errorMessage: message,
          });
        });
      }
    }

    return allResults;
  }

  async sendMessage(message: Message) {
    if (!this.firebaseApp) {
      throw new Error('Firebase Admin SDK is not configured.');
    }

    return getMessaging(this.firebaseApp).send(message);
  }

  private initializeFirebaseApp(): App | null {
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.configService
      .get<string>('FIREBASE_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'Firebase env variables are missing. Push notifications will be skipped.',
      );

      return null;
    }

    if (getApps().length > 0) {
      return getApps()[0];
    }

    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  private chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }

    return chunks;
  }
}
