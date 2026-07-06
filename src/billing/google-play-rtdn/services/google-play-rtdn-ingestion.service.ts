import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { GooglePlayBillingService } from '../../google-play/google-play-billing.service';
import { GooglePlayRtdnEvent } from '../entities/google-play-rtdn-event.entity';
import {
  GooglePlayDeveloperNotification,
  GooglePlayRtdnEventStatus,
  GooglePlayRtdnNotificationKind,
  GooglePubSubPushEnvelope,
} from 'src/billing/types/google-play-rtdn.type';
import { GooglePlayRtdnCipherService } from './google-play-rtdn-cipher.service';

@Injectable()
export class GooglePlayRtdnIngestionService {
  private readonly logger = new Logger(GooglePlayRtdnIngestionService.name);

  private readonly expectedPackageName: string;

  constructor(
    @InjectRepository(GooglePlayRtdnEvent)
    private readonly eventRepository: Repository<GooglePlayRtdnEvent>,

    private readonly configService: ConfigService,

    private readonly cipherService: GooglePlayRtdnCipherService,

    private readonly googlePlayBillingService: GooglePlayBillingService,
  ) {
    this.expectedPackageName =
      this.configService.get<string>('GOOGLE_PLAY_PACKAGE_NAME')?.trim() ?? '';
  }

  async ingest(rawEnvelope: unknown): Promise<{
    accepted: true;
    duplicate: boolean;
    messageId: string;
  }> {
    const envelope = this.parseEnvelope(rawEnvelope);

    const messageId = envelope.message.messageId ?? envelope.message.message_id;

    if (!messageId?.trim()) {
      throw new BadRequestException('Pub/Sub messageId is required.');
    }

    if (!envelope.message.data?.trim()) {
      throw new BadRequestException('Pub/Sub message.data is required.');
    }

    const notification = this.decodeDeveloperNotification(
      envelope.message.data,
    );

    if (notification.packageName !== this.expectedPackageName) {
      throw new BadRequestException(
        'RTDN package name does not match the configured Android application.',
      );
    }

    const classified = this.classifyNotification(notification);

    const eventTime = this.parseEventTime(notification.eventTimeMillis);

    const publishTime = this.parseOptionalDate(
      envelope.message.publishTime ?? envelope.message.publish_time,
    );

    const encrypted = this.cipherService.encryptJson(notification);

    const event = this.eventRepository.create({
      messageId: messageId.trim(),

      pubsubSubscription: envelope.subscription?.trim() || null,

      publishTime,

      packageName: notification.packageName,

      eventTime,

      notificationKind: classified.kind,

      notificationType: classified.notificationType,

      productId: classified.productId,

      providerOrderId: classified.providerOrderId,

      purchaseTokenHash: classified.purchaseToken
        ? this.googlePlayBillingService.hashPurchaseToken(
            classified.purchaseToken,
          )
        : null,

      payloadCiphertext: encrypted.ciphertext,
      payloadIv: encrypted.iv,
      payloadAuthTag: encrypted.authTag,

      pubsubAttributes: envelope.message.attributes ?? null,

      authoritativePayload: null,
      processingResult: null,

      status: GooglePlayRtdnEventStatus.PENDING,

      attemptCount: 0,

      lastErrorCode: null,
      lastErrorMessage: null,

      nextAttemptAt: new Date(),
      processingStartedAt: null,
      processedAt: null,
    });

    try {
      await this.eventRepository.save(event);

      this.logger.log(
        `Accepted Google Play RTDN message ${event.messageId} (${event.notificationKind}).`,
      );

      return {
        accepted: true,
        duplicate: false,
        messageId: event.messageId,
      };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        this.logger.debug(
          `Ignored duplicate Google Play RTDN message ${messageId}.`,
        );

        return {
          accepted: true,
          duplicate: true,
          messageId: messageId.trim(),
        };
      }

      throw error;
    }
  }

  private parseEnvelope(value: unknown): GooglePubSubPushEnvelope {
    if (!this.isRecord(value)) {
      throw new BadRequestException('Invalid Pub/Sub push envelope.');
    }

    if (!this.isRecord(value.message)) {
      throw new BadRequestException('Pub/Sub message object is required.');
    }

    const message = value.message;

    const attributes = this.isRecord(message.attributes)
      ? this.parseStringMap(message.attributes)
      : undefined;

    return {
      message: {
        data: this.requireString(message.data, 'Pub/Sub message.data'),

        messageId: this.optionalString(message.messageId),

        message_id: this.optionalString(message.message_id),

        publishTime: this.optionalString(message.publishTime),

        publish_time: this.optionalString(message.publish_time),

        attributes,
      },

      subscription: this.optionalString(value.subscription),
    };
  }

  private decodeDeveloperNotification(
    encodedData: string,
  ): GooglePlayDeveloperNotification {
    try {
      const decoded = Buffer.from(encodedData, 'base64').toString('utf8');

      if (!decoded.trim()) {
        throw new Error('Decoded Pub/Sub data is empty.');
      }

      const parsed: unknown = JSON.parse(decoded);

      if (!this.isRecord(parsed)) {
        throw new Error('Decoded notification is not an object.');
      }

      return parsed as unknown as GooglePlayDeveloperNotification;
    } catch {
      throw new BadRequestException(
        'Pub/Sub message.data is not a valid Base64-encoded Google Play notification.',
      );
    }
  }

  private classifyNotification(notification: GooglePlayDeveloperNotification): {
    kind: GooglePlayRtdnNotificationKind;
    notificationType: number | null;
    purchaseToken: string | null;
    productId: string | null;
    providerOrderId: string | null;
  } {
    const presentKinds = [
      notification.testNotification
        ? GooglePlayRtdnNotificationKind.TEST
        : null,

      notification.subscriptionNotification
        ? GooglePlayRtdnNotificationKind.SUBSCRIPTION
        : null,

      notification.oneTimeProductNotification
        ? GooglePlayRtdnNotificationKind.ONE_TIME_PRODUCT
        : null,

      notification.voidedPurchaseNotification
        ? GooglePlayRtdnNotificationKind.VOIDED_PURCHASE
        : null,
    ].filter(
      (value): value is GooglePlayRtdnNotificationKind => value !== null,
    );

    if (presentKinds.length !== 1) {
      throw new BadRequestException(
        'Google Play notification must contain exactly one notification payload.',
      );
    }

    const kind = presentKinds[0];

    if (kind === GooglePlayRtdnNotificationKind.TEST) {
      return {
        kind,
        notificationType: null,
        purchaseToken: null,
        productId: null,
        providerOrderId: null,
      };
    }

    if (kind === GooglePlayRtdnNotificationKind.SUBSCRIPTION) {
      const item = notification.subscriptionNotification;

      if (
        !item ||
        !Number.isInteger(item.notificationType) ||
        !item.purchaseToken?.trim()
      ) {
        throw new BadRequestException('Invalid subscription RTDN payload.');
      }

      return {
        kind,
        notificationType: item.notificationType,
        purchaseToken: item.purchaseToken.trim(),
        productId: null,
        providerOrderId: null,
      };
    }

    if (kind === GooglePlayRtdnNotificationKind.ONE_TIME_PRODUCT) {
      const item = notification.oneTimeProductNotification;

      if (
        !item ||
        !Number.isInteger(item.notificationType) ||
        !item.purchaseToken?.trim() ||
        !item.sku?.trim()
      ) {
        throw new BadRequestException('Invalid one-time product RTDN payload.');
      }

      return {
        kind,
        notificationType: item.notificationType,
        purchaseToken: item.purchaseToken.trim(),
        productId: item.sku.trim(),
        providerOrderId: null,
      };
    }

    const item = notification.voidedPurchaseNotification;

    if (
      !item ||
      !item.purchaseToken?.trim() ||
      !item.orderId?.trim() ||
      !Number.isInteger(item.productType) ||
      !Number.isInteger(item.refundType)
    ) {
      throw new BadRequestException('Invalid voided-purchase RTDN payload.');
    }

    return {
      kind,
      notificationType: item.productType,
      purchaseToken: item.purchaseToken.trim(),
      productId: null,
      providerOrderId: item.orderId.trim(),
    };
  }

  private parseEventTime(rawValue: string): Date {
    const milliseconds = Number(rawValue);

    if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
      throw new BadRequestException('Invalid Google Play eventTimeMillis.');
    }

    const date = new Date(milliseconds);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid Google Play event timestamp.');
    }

    return date;
  }

  private parseOptionalDate(value?: string): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private requireString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    return value;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private parseStringMap(
    value: Record<string, unknown>,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isUniqueViolation(error: unknown): boolean {
    if (error instanceof QueryFailedError) {
      const driverError = error.driverError as {
        code?: string;
      };

      return driverError.code === '23505';
    }

    return false;
  }
}
