import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { GooglePlayBillingService } from '../../google-play/google-play-billing.service';

import { CourseOrderProviderTransaction } from 'src/module-2/course-commerce/entities/course-order-provider-transaction.entity';
import { CoursePurchaseOrder } from 'src/module-2/course-commerce/entities/course-purchase-order.entity';
import { AdminCourseCommerceService } from 'src/module-2/course-commerce/services/admin-course-commerce.service';
import { CourseCommerceService } from 'src/module-2/course-commerce/services/course-commerce.service';
import {
  CoursePaymentProvider,
  CoursePurchaseStatus,
} from 'src/module-2/course-commerce/types/course-commerce.type';

import { StoreOrderProviderTransaction } from 'src/package-store/entities/store-order-provider-transaction.entity';
import { StoreOrder } from 'src/package-store/entities/store-order.entity';

import { GooglePlayRtdnEvent } from '../entities/google-play-rtdn-event.entity';
import {
  GooglePlayDeveloperNotification,
  GooglePlayOneTimeProductNotificationType,
  GooglePlayRtdnEventStatus,
  GooglePlayRtdnNotificationKind,
  GooglePlayRtdnProcessingOutput,
  GooglePlaySubscriptionNotificationType,
  GooglePlayVoidedProductType,
  GooglePlayVoidedRefundType,
} from 'src/billing/types/google-play-rtdn.type';
import { GooglePlayRtdnCipherService } from './google-play-rtdn-cipher.service';
import { PackageStoreService } from 'src/package-store/services/package-store.service';
import {
  StoreOrderStatus,
  StorePaymentProvider,
} from 'src/package-store/types/package-store.type';
import { GooglePlaySubscriptionLifecycleService } from 'src/billing/google-play-subscriptions/services/google-play-subscription-lifecycle.service';
import { QueryGooglePlayRtdnEventsDto } from 'src/billing/google-play-reconciliation/dto/google-play-reconciliation.dto';
import { GooglePlayProductPurchaseV2 } from 'src/billing/types/google-play-billing.type';

type InternalPurchaseMatch =
  | {
      domain: 'course';
      transaction: CourseOrderProviderTransaction;
    }
  | {
      domain: 'package_store';
      transaction: StoreOrderProviderTransaction;
    };

@Injectable()
export class GooglePlayRtdnProcessorService {
  private readonly logger = new Logger(GooglePlayRtdnProcessorService.name);

  private readonly maxAttempts: number;

  private readonly batchSize: number;

  private readonly staleMinutes: number;

  private workerRunning = false;

  constructor(
    @InjectRepository(GooglePlayRtdnEvent)
    private readonly eventRepository: Repository<GooglePlayRtdnEvent>,

    @InjectRepository(CourseOrderProviderTransaction)
    private readonly courseTransactionRepository: Repository<CourseOrderProviderTransaction>,

    @InjectRepository(CoursePurchaseOrder)
    private readonly courseOrderRepository: Repository<CoursePurchaseOrder>,

    @InjectRepository(StoreOrderProviderTransaction)
    private readonly storeTransactionRepository: Repository<StoreOrderProviderTransaction>,

    @InjectRepository(StoreOrder)
    private readonly storeOrderRepository: Repository<StoreOrder>,

    private readonly subscriptionLifecycleService: GooglePlaySubscriptionLifecycleService,

    private readonly dataSource: DataSource,

    private readonly configService: ConfigService,

    private readonly cipherService: GooglePlayRtdnCipherService,

    private readonly googlePlayBillingService: GooglePlayBillingService,

    private readonly courseCommerceService: CourseCommerceService,

    private readonly adminCourseCommerceService: AdminCourseCommerceService,

    private readonly packageStoreService: PackageStoreService,
  ) {
    this.maxAttempts = this.parsePositiveInteger(
      this.configService.get<string>('GOOGLE_PLAY_RTDN_MAX_ATTEMPTS'),
      10,
    );

    this.batchSize = this.parsePositiveInteger(
      this.configService.get<string>('GOOGLE_PLAY_RTDN_BATCH_SIZE'),
      10,
    );

    this.staleMinutes = this.parsePositiveInteger(
      this.configService.get<string>('GOOGLE_PLAY_RTDN_STALE_MINUTES'),
      15,
    );
  }

  @Cron('*/10 * * * * *', {
    name: 'google-play-rtdn-worker',
  })
  async processPendingEvents(): Promise<void> {
    if (this.workerRunning) {
      return;
    }

    this.workerRunning = true;

    try {
      for (let index = 0; index < this.batchSize; index += 1) {
        const event = await this.claimNextEvent();

        if (!event) {
          break;
        }

        await this.processClaimedEvent(event);
      }
    } finally {
      this.workerRunning = false;
    }
  }

  async retryFailedEvents(params: {
    includeDeadLetter?: boolean;
    limit?: number;
  }) {
    const limit = Math.min(1000, Math.max(1, params.limit ?? 100));

    const statuses = [GooglePlayRtdnEventStatus.FAILED];

    if (params.includeDeadLetter) {
      statuses.push(GooglePlayRtdnEventStatus.DEAD_LETTER);
    }

    const events = await this.eventRepository
      .createQueryBuilder('event')
      .select('event.id', 'id')
      .where('event.status IN (:...statuses)', {
        statuses,
      })
      .orderBy('event.updatedAt', 'ASC')
      .limit(limit)
      .getRawMany<{
        id: string;
      }>();

    const ids = events.map((event) => event.id);

    if (ids.length === 0) {
      return {
        queued: 0,
      };
    }

    await this.eventRepository
      .createQueryBuilder()
      .update(GooglePlayRtdnEvent)
      .set({
        status: GooglePlayRtdnEventStatus.PENDING,

        attemptCount: 0,

        nextAttemptAt: new Date(),

        processingStartedAt: null,

        lastErrorCode: null,

        lastErrorMessage: null,
      })
      .whereInIds(ids)
      .execute();

    await this.processPendingEvents();

    return {
      queued: ids.length,
    };
  }

  async retryEvent(eventId: string) {
    const event = await this.eventRepository.findOne({
      where: {
        id: eventId,
      },
    });

    if (!event) {
      throw new NotFoundException('Google Play RTDN event not found.');
    }

    if (event.status === GooglePlayRtdnEventStatus.PROCESSED) {
      throw new ConflictException('This RTDN event was already processed.');
    }

    await this.eventRepository.update(
      {
        id: event.id,
      },
      {
        status: GooglePlayRtdnEventStatus.PENDING,

        attemptCount: 0,

        nextAttemptAt: new Date(),

        processingStartedAt: null,

        lastErrorCode: null,

        lastErrorMessage: null,
      },
    );

    await this.processPendingEvents();

    return this.eventRepository.findOne({
      where: {
        id: event.id,
      },
    });
  }

  async findEvents(query: QueryGooglePlayRtdnEventsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const queryBuilder = this.eventRepository
      .createQueryBuilder('event')
      .orderBy('event.receivedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      queryBuilder.andWhere('event.status = :status', {
        status: query.status,
      });
    }

    if (query.kind) {
      queryBuilder.andWhere('event.notificationKind = :kind', {
        kind: query.kind,
      });
    }

    const search = query.search?.trim();

    if (search) {
      queryBuilder.andWhere(
        `(
        CAST(event.id AS TEXT) ILIKE :search
        OR event.messageId ILIKE :search
        OR event.productId ILIKE :search
        OR event.providerOrderId ILIKE :search
        OR event.purchaseTokenHash ILIKE :search
      )`,
        {
          search: `%${search}%`,
        },
      );
    }

    const [events, total] = await queryBuilder.getManyAndCount();

    return {
      items: events.map((event) => this.mapRtdnEvent(event)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findEventById(eventId: string) {
    const event = await this.eventRepository.findOne({
      where: {
        id: eventId,
      },
    });

    if (!event) {
      throw new NotFoundException('Google Play RTDN event not found.');
    }

    return this.mapRtdnEvent(event, true);
  }

  private mapRtdnEvent(event: GooglePlayRtdnEvent, includeDetails = false) {
    return {
      id: event.id,

      messageId: event.messageId,
      pubsubSubscription: event.pubsubSubscription,
      publishTime: event.publishTime,

      packageName: event.packageName,
      eventTime: event.eventTime,

      notificationKind: event.notificationKind,
      notificationType: event.notificationType,

      productId: event.productId,
      providerOrderId: event.providerOrderId,
      purchaseTokenHash: event.purchaseTokenHash,

      status: event.status,
      attemptCount: event.attemptCount,

      lastErrorCode: event.lastErrorCode,
      lastErrorMessage: event.lastErrorMessage,
      nextAttemptAt: event.nextAttemptAt,
      processingStartedAt: event.processingStartedAt,
      processedAt: event.processedAt,

      receivedAt: event.receivedAt,
      updatedAt: event.updatedAt,

      pubsubAttributes: includeDetails ? event.pubsubAttributes : undefined,
      authoritativePayload: includeDetails
        ? event.authoritativePayload
        : undefined,
      processingResult: includeDetails ? event.processingResult : undefined,
    };
  }

  async getProcessingSummary() {
    const counts = await this.eventRepository
      .createQueryBuilder('event')
      .select('event.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('event.status')
      .getRawMany<{
        status: GooglePlayRtdnEventStatus;

        count: string;
      }>();

    return Object.fromEntries(
      counts.map((item) => [item.status, Number(item.count)]),
    );
  }

  private async claimNextEvent(): Promise<GooglePlayRtdnEvent | null> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(GooglePlayRtdnEvent);

      const now = new Date();

      const staleBefore = new Date(
        now.getTime() - this.staleMinutes * 60 * 1000,
      );

      const event = await repository
        .createQueryBuilder('event')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where(
          `(
              event.status = :pending
              OR (
                event.status = :failed
                AND event.nextAttemptAt <= :now
              )
              OR (
                event.status = :processing
                AND event.processingStartedAt <= :staleBefore
              )
            )`,
          {
            pending: GooglePlayRtdnEventStatus.PENDING,

            failed: GooglePlayRtdnEventStatus.FAILED,

            processing: GooglePlayRtdnEventStatus.PROCESSING,

            now,

            staleBefore,
          },
        )
        .andWhere('event.attemptCount < :maxAttempts', {
          maxAttempts: this.maxAttempts,
        })
        .orderBy('event.receivedAt', 'ASC')
        .take(1)
        .getOne();

      if (!event) {
        return null;
      }

      event.status = GooglePlayRtdnEventStatus.PROCESSING;

      event.attemptCount += 1;

      event.processingStartedAt = now;

      event.nextAttemptAt = null;

      event.lastErrorCode = null;

      event.lastErrorMessage = null;

      return repository.save(event);
    });
  }

  private async processClaimedEvent(event: GooglePlayRtdnEvent): Promise<void> {
    try {
      const notification =
        this.cipherService.decryptJson<GooglePlayDeveloperNotification>({
          ciphertext: event.payloadCiphertext,
          iv: event.payloadIv,
          authTag: event.payloadAuthTag,
        });

      const output = await this.processNotification(event, notification);

      /*
       * Use save() instead of Repository.update().
       *
       * TypeORM's QueryDeepPartialEntity does not correctly accept
       * Record<string, unknown> for JSONB properties.
       */
      event.status = GooglePlayRtdnEventStatus.PROCESSED;
      event.authoritativePayload = output.authoritativePayload;
      event.processingResult = output.result;
      event.processedAt = new Date();
      event.processingStartedAt = null;
      event.nextAttemptAt = null;
      event.lastErrorCode = null;
      event.lastErrorMessage = null;

      await this.eventRepository.save(event);

      this.logger.log(`Processed Google Play RTDN ${event.messageId}.`);
    } catch (error) {
      await this.markProcessingFailure(event, error);
    }
  }

  private async processNotification(
    event: GooglePlayRtdnEvent,
    notification: GooglePlayDeveloperNotification,
  ): Promise<GooglePlayRtdnProcessingOutput> {
    switch (event.notificationKind) {
      case GooglePlayRtdnNotificationKind.TEST:
        return {
          authoritativePayload: null,

          result: {
            action: 'test_notification_received',

            messageId: event.messageId,
          },
        };

      case GooglePlayRtdnNotificationKind.ONE_TIME_PRODUCT:
        return this.handleOneTimeProduct(event, notification);

      case GooglePlayRtdnNotificationKind.SUBSCRIPTION:
        return this.handleSubscription(event, notification);

      case GooglePlayRtdnNotificationKind.VOIDED_PURCHASE:
        return this.handleVoidedPurchase(event, notification);

      default:
        throw new BadRequestException('Unsupported Google Play RTDN kind.');
    }
  }

  private async handleOneTimeProduct(
    event: GooglePlayRtdnEvent,
    notification: GooglePlayDeveloperNotification,
  ): Promise<GooglePlayRtdnProcessingOutput> {
    const item = notification.oneTimeProductNotification;

    if (!item) {
      throw new BadRequestException(
        'One-time product notification payload is missing.',
      );
    }

    let authoritativePurchase: GooglePlayProductPurchaseV2 | null = null;
    let authoritative: Record<string, unknown> | null = null;

    try {
      authoritativePurchase =
        await this.googlePlayBillingService.getOneTimeProductPurchaseByToken({
          purchaseToken: item.purchaseToken,
        });

      authoritative = authoritativePurchase as unknown as Record<
        string,
        unknown
      >;
    } catch (error) {
      /*
       * A canceled pending purchase might no longer be queryable.
       * The canceled RTDN itself is sufficient to ensure that
       * entitlement is not granted.
       */
      if (
        item.notificationType !==
        GooglePlayOneTimeProductNotificationType.CANCELED
      ) {
        throw error;
      }
    }

    if (
      item.notificationType ===
      GooglePlayOneTimeProductNotificationType.CANCELED
    ) {
      return {
        authoritativePayload: authoritative,

        result: {
          action: 'pending_one_time_purchase_canceled',

          productId: item.sku,

          entitlementChanged: false,
        },
      };
    }

    if (
      item.notificationType !==
      GooglePlayOneTimeProductNotificationType.PURCHASED
    ) {
      return {
        authoritativePayload: authoritative,

        result: {
          action: 'unknown_one_time_notification_recorded',

          notificationType: item.notificationType,

          entitlementChanged: false,
        },
      };
    }

    const tokenHash = this.googlePlayBillingService.hashPurchaseToken(
      item.purchaseToken,
    );

    let match = await this.findInternalPurchase({
      tokenHash,
    });

    const obfuscatedAccountId =
      authoritativePurchase?.obfuscatedExternalAccountId
        ?.trim()
        .toLowerCase() ?? '';

    if (!match && obfuscatedAccountId) {
      match = await this.findPendingCoursePurchaseByAccount({
        productId: item.sku,
        obfuscatedAccountId,
      });
    }

    if (!match && obfuscatedAccountId) {
      match = await this.findPendingStorePurchaseByAccount({
        productId: item.sku,

        obfuscatedAccountId,

        purchaseTime: this.parseGooglePlayDate(
          authoritativePurchase?.purchaseCompletionTime,
        ),
      });
    }

    if (!match) {
      /*
       * The purchase contains the account identifier generated when
       * the backend order was created. The order may still be committing,
       * so keep this RTDN retryable instead of permanently processing it.
       */
      if (obfuscatedAccountId) {
        throw new ConflictException(
          'The matching pending Google Play order is not available yet.',
        );
      }

      /*
       * Purchases from an old app build might not contain an account ID.
       * Such purchases cannot be safely attached to a user through RTDN.
       */
      return {
        authoritativePayload: authoritative,

        result: {
          action: 'one_time_purchase_unmatched',

          productId: item.sku,

          entitlementChanged: false,

          note: 'The Google Play purchase did not contain a recoverable application account identifier.',
        },
      };
    }

    if (match.domain === 'course') {
      const order = await this.courseOrderRepository.findOne({
        where: {
          id: match.transaction.orderId,
        },
      });

      if (!order) {
        throw new ConflictException('Matched course order was not found.');
      }

      if (order.status === CoursePurchaseStatus.PAID) {
        const acknowledgement =
          await this.googlePlayBillingService.acknowledgeOneTimeProduct({
            productId: item.sku,
            purchaseToken: item.purchaseToken,
          });

        return {
          authoritativePayload: authoritative,
          result: {
            action: 'course_already_paid',
            domain: 'course',
            internalOrderId: order.id,
            entitlementChanged: false,
            acknowledged: acknowledgement.acknowledged,
            alreadyAcknowledged: acknowledgement.alreadyAcknowledged,
          },
        };
      }

      if (order.status === CoursePurchaseStatus.REFUNDED) {
        return {
          authoritativePayload: authoritative,

          result: {
            action: 'course_already_refunded',

            domain: 'course',

            internalOrderId: order.id,

            entitlementChanged: false,
          },
        };
      }

      await this.courseCommerceService.verifyGooglePlayPurchase({
        userId: order.userId,

        orderId: order.id,

        dto: {
          productId: item.sku,

          purchaseToken: item.purchaseToken,
        },
      });

      return {
        authoritativePayload: authoritative,

        result: {
          action: 'course_purchase_completed',

          domain: 'course',

          internalOrderId: order.id,

          entitlementChanged: true,
        },
      };
    }

    const order = await this.storeOrderRepository.findOne({
      where: {
        id: match.transaction.orderId,
      },
    });

    if (!order) {
      throw new ConflictException('Matched package-store order was not found.');
    }

    if (order.status === StoreOrderStatus.COMPLETED) {
      return {
        authoritativePayload: authoritative,

        result: {
          action: 'package_order_already_completed',

          domain: 'package_store',

          internalOrderId: order.id,

          entitlementChanged: false,
        },
      };
    }

    if (order.status === StoreOrderStatus.REFUNDED) {
      return {
        authoritativePayload: authoritative,

        result: {
          action: 'package_order_already_refunded',

          domain: 'package_store',

          internalOrderId: order.id,

          entitlementChanged: false,
        },
      };
    }

    await this.packageStoreService.verifyGooglePlayPurchase({
      userId: order.userId,

      orderId: order.id,

      dto: {
        productId: item.sku,

        purchaseToken: item.purchaseToken,
      },
    });

    return {
      authoritativePayload: authoritative,

      result: {
        action: 'package_purchase_completed',

        domain: 'package_store',

        internalOrderId: order.id,

        entitlementChanged: true,
      },
    };
  }

  private async handleSubscription(
    event: GooglePlayRtdnEvent,
    notification: GooglePlayDeveloperNotification,
  ): Promise<GooglePlayRtdnProcessingOutput> {
    const item = notification.subscriptionNotification;

    if (!item) {
      throw new BadRequestException(
        'Subscription notification payload is missing.',
      );
    }

    if (
      item.notificationType ===
      GooglePlaySubscriptionNotificationType.PENDING_PURCHASE_CANCELED
    ) {
      const result =
        await this.subscriptionLifecycleService.markPendingPurchaseCanceled({
          purchaseToken: item.purchaseToken,

          eventTime: event.eventTime,

          rtdnEventId: event.id,
        });

      return {
        authoritativePayload: result.sanitizedPayload,

        result: {
          action: 'subscription_pending_purchase_canceled',

          matched: result.matched,

          ignored: result.ignored,

          subscription: result.subscription,

          entitlementChanged: result.matched && !result.ignored,
        },
      };
    }

    const authoritativePurchase =
      await this.googlePlayBillingService.getSubscriptionPurchaseByToken({
        purchaseToken: item.purchaseToken,
      });

    const tokenHash = this.googlePlayBillingService.hashPurchaseToken(
      item.purchaseToken,
    );

    let match = await this.findInternalPurchase({
      tokenHash,
    });

    const obfuscatedAccountId =
      authoritativePurchase.externalAccountIdentifiers?.obfuscatedExternalAccountId
        ?.trim()
        .toLowerCase() ?? '';

    const subscriptionProductId = this.extractSubscriptionProductId(
      authoritativePurchase as unknown as Record<string, unknown>,
    );

    const purchaseStartedAt = this.parseGooglePlayDate(
      authoritativePurchase.startTime,
    );

    if (!match && obfuscatedAccountId && subscriptionProductId) {
      match = await this.findPendingStorePurchaseByAccount({
        productId: subscriptionProductId,

        obfuscatedAccountId,

        purchaseTime: purchaseStartedAt,
      });
    }

    if (!match && obfuscatedAccountId) {
      /*
       * The app might have closed before sending the
       * purchase token to the API. Keep the RTDN event
       * retryable while the backend order is committing.
       */
      throw new ConflictException(
        'The matching Google Play subscription order is not available yet.',
      );
    }

    let initialOrderId: string | null = null;

    if (
      item.notificationType ===
        GooglePlaySubscriptionNotificationType.PURCHASED &&
      match?.domain === 'package_store'
    ) {
      const order = await this.storeOrderRepository.findOne({
        where: {
          id: match.transaction.orderId,
        },
      });

      if (order) {
        initialOrderId = order.id;

        if (
          order.status !== StoreOrderStatus.COMPLETED &&
          order.status !== StoreOrderStatus.REFUNDED
        ) {
          const productId = this.extractSubscriptionProductId(
            authoritativePurchase as unknown as Record<string, unknown>,
          );

          if (!productId) {
            throw new BadRequestException(
              'Google Play subscription product ID is missing.',
            );
          }

          await this.packageStoreService.verifyGooglePlayPurchase({
            userId: order.userId,

            orderId: order.id,

            dto: {
              productId,

              purchaseToken: item.purchaseToken,
            },
          });
        }
      }
    }

    const lifecycleResult =
      await this.subscriptionLifecycleService.syncFromRtdn({
        purchaseToken: item.purchaseToken,

        notificationType: item.notificationType,

        eventTime: event.eventTime,

        rtdnEventId: event.id,

        authoritativePurchase,

        initialOrderId,
      });

    return {
      authoritativePayload: lifecycleResult.sanitizedPayload,

      result: {
        action: 'subscription_lifecycle_synchronized',

        notificationType: item.notificationType,

        matched: lifecycleResult.matched,

        ignored: lifecycleResult.ignored,

        renewalRecorded: lifecycleResult.renewalRecorded,

        subscription: lifecycleResult.subscription,

        entitlementChanged: lifecycleResult.matched && !lifecycleResult.ignored,
      },
    };
  }

  private async handleVoidedPurchase(
    event: GooglePlayRtdnEvent,
    notification: GooglePlayDeveloperNotification,
  ): Promise<GooglePlayRtdnProcessingOutput> {
    const item = notification.voidedPurchaseNotification;

    if (!item) {
      throw new BadRequestException(
        'Voided-purchase notification payload is missing.',
      );
    }

    const tokenHash = this.googlePlayBillingService.hashPurchaseToken(
      item.purchaseToken,
    );

    if (
      item.refundType ===
      GooglePlayVoidedRefundType.QUANTITY_BASED_PARTIAL_REFUND
    ) {
      /*
       * Current application purchases enforce quantity === 1.
       * Record this for manual review rather than reversing
       * an unknown amount.
       */
      return {
        authoritativePayload: null,

        result: {
          action: 'partial_void_recorded_for_manual_review',

          providerOrderId: item.orderId,

          productType: item.productType,

          refundType: item.refundType,

          entitlementChanged: false,
        },
      };
    }

    if (item.productType === GooglePlayVoidedProductType.SUBSCRIPTION) {
      const lifecycleResult =
        await this.subscriptionLifecycleService.applyVoidedPurchase({
          purchaseToken: item.purchaseToken,

          providerOrderId: item.orderId,

          eventTime: event.eventTime,

          rtdnEventId: event.id,
        });

      return {
        authoritativePayload: null,

        result: {
          action: 'subscription_void_applied',

          providerOrderId: item.orderId,

          productType: item.productType,

          refundType: item.refundType,

          matched: lifecycleResult.matched,

          initialOrderId: lifecycleResult.initialOrderId,

          isInitialOrder: lifecycleResult.isInitialOrder,

          entitlementChanged: lifecycleResult.entitlementRevoked,

          subscription: lifecycleResult.subscription,
        },
      };
    }

    if (item.productType !== GooglePlayVoidedProductType.ONE_TIME_PRODUCT) {
      throw new BadRequestException(
        'Unsupported voided Google Play product type.',
      );
    }

    const match = await this.findInternalPurchase({
      tokenHash,
      providerOrderId: item.orderId,
    });

    if (!match) {
      return {
        authoritativePayload: null,

        result: {
          action: 'voided_purchase_unmatched',

          providerOrderId: item.orderId,

          entitlementChanged: false,
        },
      };
    }

    if (match.domain === 'course') {
      await this.adminCourseCommerceService.applyGooglePlayVoidedPurchase({
        internalOrderId: match.transaction.orderId,

        providerOrderId: item.orderId,

        purchaseTokenHash: tokenHash,

        eventTime: event.eventTime,
      });

      return {
        authoritativePayload: null,

        result: {
          action: 'course_access_revoked_from_voided_purchase',

          domain: 'course',

          internalOrderId: match.transaction.orderId,

          providerOrderId: item.orderId,

          entitlementChanged: true,
        },
      };
    }

    await this.packageStoreService.applyGooglePlayVoidedPurchase({
      internalOrderId: match.transaction.orderId,

      providerOrderId: item.orderId,

      purchaseTokenHash: tokenHash,

      eventTime: event.eventTime,
    });

    return {
      authoritativePayload: null,

      result: {
        action: 'package_resources_reversed_from_voided_purchase',

        domain: 'package_store',

        internalOrderId: match.transaction.orderId,

        providerOrderId: item.orderId,

        entitlementChanged: true,
      },
    };
  }

  private async findPendingCoursePurchaseByAccount(params: {
    productId: string;
    obfuscatedAccountId: string;
  }): Promise<InternalPurchaseMatch | null> {
    const transactions = await this.courseTransactionRepository
      .createQueryBuilder('transaction')
      .innerJoinAndSelect('transaction.order', 'purchaseOrder')
      .where('transaction.provider = :provider', {
        provider: CoursePaymentProvider.GOOGLE_PLAY,
      })
      .andWhere('transaction.productId = :productId', {
        productId: params.productId,
      })
      .andWhere('transaction.obfuscatedAccountId = :obfuscatedAccountId', {
        obfuscatedAccountId: params.obfuscatedAccountId,
      })
      .andWhere('transaction.tokenHash IS NULL')
      .andWhere('purchaseOrder.status IN (:...statuses)', {
        statuses: [
          CoursePurchaseStatus.PENDING,
          CoursePurchaseStatus.PROCESSING,
        ],
      })
      .orderBy('purchaseOrder.createdAt', 'DESC')
      .take(2)
      .getMany();

    if (transactions.length === 0) {
      return null;
    }

    if (transactions.length > 1) {
      this.logger.warn(
        'Multiple pending Google Play course orders matched the same account and product. The latest order will be used.',
      );
    }

    return {
      domain: 'course',
      transaction: transactions[0],
    };
  }

  private async findPendingStorePurchaseByAccount(params: {
    productId: string;
    obfuscatedAccountId: string;
    purchaseTime?: Date | null;
  }): Promise<InternalPurchaseMatch | null> {
    const query = this.storeTransactionRepository
      .createQueryBuilder('transaction')
      .innerJoinAndSelect('transaction.order', 'storeOrder')
      .where('transaction.provider = :provider', {
        provider: StorePaymentProvider.GOOGLE_PLAY,
      })
      .andWhere('transaction.productId = :productId', {
        productId: params.productId,
      })
      .andWhere('transaction.obfuscatedAccountId = :obfuscatedAccountId', {
        obfuscatedAccountId: params.obfuscatedAccountId,
      })
      .andWhere('transaction.tokenHash IS NULL')
      .andWhere('storeOrder.status IN (:...statuses)', {
        statuses: [
          StoreOrderStatus.PENDING,
          StoreOrderStatus.EXPIRED,
          StoreOrderStatus.CANCELLED,
        ],
      });

    if (params.purchaseTime) {
      /*
       * Avoid attaching an older Google purchase to an
       * order that was created after that purchase.
       */
      const latestAllowedOrderTime = new Date(
        params.purchaseTime.getTime() + 5 * 60 * 1000,
      );

      query.andWhere('storeOrder.createdAt <= :latestAllowedOrderTime', {
        latestAllowedOrderTime,
      });
    }

    const transactions = await query
      .orderBy('storeOrder.createdAt', 'DESC')
      .take(2)
      .getMany();

    if (transactions.length === 0) {
      return null;
    }

    if (transactions.length > 1) {
      this.logger.warn(
        'Multiple recoverable Google Play package-store orders matched the same account and product. The newest eligible order will be used.',
      );
    }

    return {
      domain: 'package_store',
      transaction: transactions[0],
    };
  }

  private async findInternalPurchase(params: {
    tokenHash: string;
    providerOrderId?: string;
  }): Promise<InternalPurchaseMatch | null> {
    const courseQuery = this.courseTransactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.provider = :provider', {
        provider: CoursePaymentProvider.GOOGLE_PLAY,
      })
      .andWhere(
        params.providerOrderId
          ? `(
                transaction.tokenHash = :tokenHash
                OR transaction.providerTransactionId = :providerOrderId
              )`
          : 'transaction.tokenHash = :tokenHash',
        {
          tokenHash: params.tokenHash,

          providerOrderId: params.providerOrderId,
        },
      );

    const storeQuery = this.storeTransactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.provider = :provider', {
        provider: StorePaymentProvider.GOOGLE_PLAY,
      })
      .andWhere(
        params.providerOrderId
          ? `(
                transaction.tokenHash = :tokenHash
                OR transaction.providerTransactionId = :providerOrderId
              )`
          : 'transaction.tokenHash = :tokenHash',
        {
          tokenHash: params.tokenHash,

          providerOrderId: params.providerOrderId,
        },
      );

    const [courseTransactions, storeTransactions] = await Promise.all([
      courseQuery.getMany(),
      storeQuery.getMany(),
    ]);

    const totalMatches = courseTransactions.length + storeTransactions.length;

    if (totalMatches === 0) {
      return null;
    }

    if (totalMatches > 1) {
      throw new ConflictException(
        'The Google Play transaction matched more than one internal order.',
      );
    }

    if (courseTransactions.length === 1) {
      return {
        domain: 'course',
        transaction: courseTransactions[0],
      };
    }

    return {
      domain: 'package_store',
      transaction: storeTransactions[0],
    };
  }

  private parseGooglePlayDate(value?: string | null): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private extractSubscriptionProductId(
    authoritative: Record<string, unknown>,
  ): string | null {
    const lineItems = authoritative.lineItems;

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return null;
    }

    const firstLineItem = lineItems[0];

    if (
      typeof firstLineItem !== 'object' ||
      firstLineItem === null ||
      Array.isArray(firstLineItem)
    ) {
      return null;
    }

    const productId = (firstLineItem as Record<string, unknown>).productId;

    return typeof productId === 'string' ? productId : null;
  }

  private async markProcessingFailure(
    event: GooglePlayRtdnEvent,
    error: unknown,
  ): Promise<void> {
    const normalized = this.normalizeError(error);

    const deadLetter = event.attemptCount >= this.maxAttempts;

    const nextAttemptAt = deadLetter
      ? null
      : new Date(Date.now() + this.calculateRetryDelayMs(event.attemptCount));

    event.status = deadLetter
      ? GooglePlayRtdnEventStatus.DEAD_LETTER
      : GooglePlayRtdnEventStatus.FAILED;

    event.lastErrorCode = normalized.code;
    event.lastErrorMessage = normalized.message;
    event.nextAttemptAt = nextAttemptAt;
    event.processingStartedAt = null;

    await this.eventRepository.save(event);

    this.logger.error(
      `Google Play RTDN ${event.messageId} failed ` +
        `on attempt ${event.attemptCount}: ` +
        normalized.message,
    );
  }

  private calculateRetryDelayMs(attemptCount: number): number {
    const seconds = Math.min(3600, 30 * 2 ** Math.max(0, attemptCount - 1));

    return seconds * 1000;
  }

  private normalizeError(error: unknown): {
    code: string;
    message: string;
  } {
    if (error instanceof Error) {
      return {
        code: error.name.slice(0, 100),

        message: error.message.slice(0, 1000),
      };
    }

    return {
      code: 'UNKNOWN_RTDN_ERROR',

      message: 'Unknown RTDN processing error.',
    };
  }

  private parsePositiveInteger(
    value: string | undefined,
    fallback: number,
  ): number {
    const parsed = Number(value);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
