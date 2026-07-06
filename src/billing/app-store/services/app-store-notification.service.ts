import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { Cron } from '@nestjs/schedule';

import { InjectRepository } from '@nestjs/typeorm';

import {
  Environment,
  NotificationTypeV2,
  Type,
} from '@apple/app-store-server-library';

import {
  Brackets,
  DataSource,
  EntityManager,
  In,
  QueryFailedError,
  Repository,
} from 'typeorm';

import { CourseCommerceService } from 'src/module-2/course-commerce/services/course-commerce.service';

import { CourseEnrollment } from 'src/module-2/course-commerce/entities/course-enrollment.entity';

import { CourseOrderProviderTransaction } from 'src/module-2/course-commerce/entities/course-order-provider-transaction.entity';

import { CoursePaymentAttempt } from 'src/module-2/course-commerce/entities/course-payment-attempt.entity';

import { CoursePurchaseOrder } from 'src/module-2/course-commerce/entities/course-purchase-order.entity';

import {
  CourseAccessType,
  CourseEnrollmentStatus,
  CoursePaymentAttemptStatus,
  CoursePaymentProvider,
  CoursePurchaseStatus,
} from 'src/module-2/course-commerce/types/course-commerce.type';

import { StoreOrder } from 'src/package-store/entities/store-order.entity';

import { StoreOrderPayment } from 'src/package-store/entities/store-order-payment.entity';

import { StoreOrderProviderTransaction } from 'src/package-store/entities/store-order-provider-transaction.entity';

import { StoreOrderTimelineEvent } from 'src/package-store/entities/store-order-timeline-event.entity';

import { PackageStoreService } from 'src/package-store/services/package-store.service';

import { StoreWalletService } from 'src/package-store/services/store-wallet.service';

import {
  StoreOrderStatus,
  StorePaymentProvider,
  StoreProviderEnvironment,
  StoreTimelineEventType,
} from 'src/package-store/types/package-store.type';

import { AppStoreServerNotificationEvent } from '../entities/app-store-server-notification-event.entity';

import {
  AppStoreNotificationEventStatus,
  VerifiedAppStoreNotification,
} from 'src/billing/types/app-store-billing.type';

import { AppStoreBillingService } from './app-store-billing.service';

import { AppStorePayloadCipherService } from './app-store-payload-cipher.service';

import { AppStoreSubscriptionLifecycleService } from './app-store-subscription-lifecycle.service';

type OneTimeOrderMatch =
  | {
      domain: 'course';
      orderId: string;
      userId: string;
    }
  | {
      domain: 'package_store';
      orderId: string;
      userId: string;
    };

@Injectable()
export class AppStoreNotificationService {
  private readonly logger = new Logger(AppStoreNotificationService.name);

  private readonly maxAttempts: number;

  constructor(
    @InjectRepository(AppStoreServerNotificationEvent)
    private readonly eventRepository: Repository<AppStoreServerNotificationEvent>,

    @InjectRepository(CoursePurchaseOrder)
    private readonly courseOrderRepository: Repository<CoursePurchaseOrder>,

    @InjectRepository(CourseOrderProviderTransaction)
    private readonly courseTransactionRepository: Repository<CourseOrderProviderTransaction>,

    @InjectRepository(StoreOrder)
    private readonly storeOrderRepository: Repository<StoreOrder>,

    @InjectRepository(StoreOrderProviderTransaction)
    private readonly storeTransactionRepository: Repository<StoreOrderProviderTransaction>,

    private readonly dataSource: DataSource,

    private readonly configService: ConfigService,

    private readonly appStoreBillingService: AppStoreBillingService,

    private readonly payloadCipherService: AppStorePayloadCipherService,

    private readonly subscriptionLifecycleService: AppStoreSubscriptionLifecycleService,

    private readonly courseCommerceService: CourseCommerceService,

    private readonly packageStoreService: PackageStoreService,

    private readonly walletService: StoreWalletService,
  ) {
    const configured = Number(
      this.configService.get<string>('APP_STORE_NOTIFICATION_MAX_ATTEMPTS'),
    );

    this.maxAttempts =
      Number.isInteger(configured) && configured > 0 ? configured : 10;
  }

  async receive(signedPayload: string) {
    /*
     * Verify the JWS before storing it.
     */
    const verified =
      await this.appStoreBillingService.verifyNotification(signedPayload);

    const encrypted = this.payloadCipherService.encryptText(signedPayload);

    let event = this.eventRepository.create({
      notificationUuid: verified.notificationUuid,

      notificationType: verified.notificationType,

      subtype: verified.subtype,

      environment: this.mapEnvironment(verified.environment),

      signedDate: verified.signedDate,

      signedPayloadHash: verified.signedPayloadHash,

      transactionId: verified.transaction?.transactionId ?? null,

      originalTransactionId:
        verified.transaction?.originalTransactionId ?? null,

      productId: verified.transaction?.productId ?? null,

      appAccountToken: this.isUuid(verified.transaction?.appAccountToken)
        ? verified.transaction!.appAccountToken!
        : null,

      payloadCiphertext: encrypted.ciphertext,

      payloadIv: encrypted.iv,

      payloadAuthTag: encrypted.authTag,

      sanitizedPayload: verified.sanitizedPayload,

      processingResult: null,

      status: AppStoreNotificationEventStatus.PENDING,

      attemptCount: 0,

      lastErrorCode: null,

      lastErrorMessage: null,

      nextAttemptAt: new Date(),

      processingStartedAt: null,

      processedAt: null,
    });

    let duplicate = false;

    try {
      event = await this.eventRepository.save(event);
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      duplicate = true;

      const existing = await this.eventRepository
        .createQueryBuilder('event')
        .where('event.notificationUuid = :notificationUuid', {
          notificationUuid: verified.notificationUuid,
        })
        .orWhere('event.signedPayloadHash = :signedPayloadHash', {
          signedPayloadHash: verified.signedPayloadHash,
        })
        .getOne();

      if (!existing) {
        throw error;
      }

      event = existing;
    }

    if (event.status !== AppStoreNotificationEventStatus.PROCESSED) {
      await this.processEventById(event.id);
    }

    const updated = await this.eventRepository.findOne({
      where: {
        id: event.id,
      },
    });

    return {
      accepted: true,

      duplicate,

      eventId: event.id,

      status: updated?.status ?? event.status,
    };
  }

  @Cron('15 * * * * *', {
    name: 'app-store-server-notification-retry',
  })
  async scheduledRetry(): Promise<void> {
    try {
      await this.processPendingEvents(100);
    } catch (error) {
      this.logger.error(
        `App Store notification retry failed: ${this.errorMessage(error)}`,
      );
    }
  }

  async processPendingEvents(limit = 100) {
    let processed = 0;
    let failed = 0;

    for (let index = 0; index < limit; index += 1) {
      const event = await this.claimNextEvent();

      if (!event) {
        break;
      }

      const success = await this.processClaimedEvent(event);

      if (success) {
        processed += 1;
      } else {
        failed += 1;
      }
    }

    return {
      processed,
      failed,
    };
  }

  async retryEvent(eventId: string) {
    const event = await this.eventRepository.findOne({
      where: {
        id: eventId,
      },
    });

    if (!event) {
      throw new NotFoundException('App Store notification event not found.');
    }

    if (event.status === AppStoreNotificationEventStatus.PROCESSED) {
      throw new ConflictException(
        'This App Store notification was already processed.',
      );
    }

    event.status = AppStoreNotificationEventStatus.PENDING;

    event.attemptCount = 0;

    event.nextAttemptAt = new Date();

    event.processingStartedAt = null;

    event.lastErrorCode = null;

    event.lastErrorMessage = null;

    await this.eventRepository.save(event);

    await this.processEventById(event.id);

    return this.eventRepository.findOne({
      where: {
        id: event.id,
      },
    });
  }

  async getProcessingSummary() {
    const counts = await this.eventRepository
      .createQueryBuilder('event')
      .select('event.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('event.status')
      .getRawMany<{
        status: AppStoreNotificationEventStatus;

        count: string;
      }>();

    return Object.fromEntries(
      counts.map((item) => [item.status, Number(item.count)]),
    );
  }

  private async processEventById(eventId: string): Promise<void> {
    const event = await this.claimSpecificEvent(eventId);

    if (!event) {
      return;
    }

    await this.processClaimedEvent(event);
  }

  private async processClaimedEvent(
    event: AppStoreServerNotificationEvent,
  ): Promise<boolean> {
    try {
      const signedPayload = this.payloadCipherService.decryptText({
        ciphertext: event.payloadCiphertext,

        iv: event.payloadIv,

        authTag: event.payloadAuthTag,
      });

      /*
       * Verify again during processing.
       * Never trust only the decoded database payload.
       */
      const verified =
        await this.appStoreBillingService.verifyNotification(signedPayload);

      const result = await this.dispatchNotification(verified, event.id);

      const current = await this.eventRepository.findOne({
        where: {
          id: event.id,
        },
      });

      if (!current) {
        throw new NotFoundException(
          'App Store notification event disappeared.',
        );
      }

      current.status = AppStoreNotificationEventStatus.PROCESSED;

      current.processingResult = result;

      current.sanitizedPayload = verified.sanitizedPayload;

      current.lastErrorCode = null;

      current.lastErrorMessage = null;

      current.nextAttemptAt = null;

      current.processingStartedAt = null;

      current.processedAt = new Date();

      await this.eventRepository.save(current);

      return true;
    } catch (error) {
      await this.markFailure(event, error);

      return false;
    }
  }

  private async dispatchNotification(
    notification: VerifiedAppStoreNotification,

    notificationEventId: string,
  ): Promise<Record<string, unknown>> {
    if (notification.notificationType === NotificationTypeV2.TEST) {
      return {
        action: 'test_notification_processed',
      };
    }

    const transaction = notification.transaction;

    if (!transaction) {
      return {
        action: 'notification_recorded_without_transaction',

        notificationType: notification.notificationType,

        subtype: notification.subtype,
      };
    }

    const signedTransactionInfo =
      notification.decoded.data?.signedTransactionInfo?.trim() ?? null;

    /*
     * Subscription events.
     */
    if (transaction.type === Type.AUTO_RENEWABLE_SUBSCRIPTION) {
      /*
       * A SUBSCRIBED notification may arrive before
       * the Flutter verification request.
       *
       * appAccountToken contains the backend order UUID,
       * so the server can complete the order safely.
       */
      if (
        notification.notificationType === NotificationTypeV2.SUBSCRIBED &&
        signedTransactionInfo
      ) {
        await this.completeOrderFromNotification(
          transaction,
          signedTransactionInfo,
        );
      }

      const lifecycle =
        await this.subscriptionLifecycleService.syncFromNotification({
          transaction,

          renewalInfo: notification.renewalInfo,

          notificationType: notification.notificationType,

          subtype: notification.subtype,

          appleStatus: notification.status,

          eventTime: notification.signedDate,

          notificationEventId,
        });

      return {
        action: 'subscription_lifecycle_synchronized',

        matched: lifecycle.matched,

        ignored: lifecycle.ignored,

        renewalRecorded: lifecycle.renewalRecorded,

        entitlementChanged: lifecycle.entitlementChanged,

        subscriptionId: lifecycle.subscription?.id ?? null,
      };
    }

    /*
     * New consumable/non-consumable transaction.
     */
    if (notification.notificationType === NotificationTypeV2.ONE_TIME_CHARGE) {
      if (!signedTransactionInfo) {
        return {
          action: 'one_time_charge_missing_signed_transaction',

          matched: false,
        };
      }

      return this.completeOrderFromNotification(
        transaction,
        signedTransactionInfo,
      );
    }

    /*
     * One-time product refund or revocation.
     */
    if (
      notification.notificationType === NotificationTypeV2.REFUND ||
      notification.notificationType === NotificationTypeV2.REVOKE
    ) {
      return this.revokeOneTimePurchase({
        transaction,

        eventTime: notification.signedDate,

        reason:
          notification.notificationType === NotificationTypeV2.REFUND
            ? 'App Store refund'
            : 'App Store revocation',

        enrollmentStatus:
          notification.notificationType === NotificationTypeV2.REFUND
            ? CourseEnrollmentStatus.REFUNDED
            : CourseEnrollmentStatus.REVOKED,
      });
    }

    /*
     * Apple reversed a previous refund.
     */
    if (notification.notificationType === NotificationTypeV2.REFUND_REVERSED) {
      return this.restoreOneTimePurchase({
        transaction,

        eventTime: notification.signedDate,
      });
    }

    return {
      action: 'notification_recorded_no_entitlement_change',

      notificationType: notification.notificationType,

      subtype: notification.subtype,

      transactionId: transaction.transactionId ?? null,
    };
  }

  private async completeOrderFromNotification(
    transaction: VerifiedAppStoreNotification['transaction'],

    signedTransactionInfo: string,
  ): Promise<Record<string, unknown>> {
    if (!transaction) {
      return {
        action: 'order_not_matched',

        matched: false,
      };
    }

    const match = await this.findOneTimeOrderMatch(transaction);

    if (!match) {
      return {
        action: 'order_not_matched',

        matched: false,
      };
    }

    const productId = this.requiredString(
      transaction.productId,

      'App Store productId',
    );

    const transactionId = this.requiredString(
      transaction.transactionId,

      'App Store transactionId',
    );

    if (match.domain === 'course') {
      const order = await this.courseOrderRepository.findOne({
        where: {
          id: match.orderId,
        },
      });

      if (!order) {
        return {
          action: 'course_order_not_found',

          matched: false,
        };
      }

      if (
        order.status === CoursePurchaseStatus.PAID ||
        order.status === CoursePurchaseStatus.REFUNDED
      ) {
        return {
          action: 'course_order_already_finalized',

          matched: true,

          orderId: order.id,

          status: order.status,
        };
      }

      const completion =
        await this.courseCommerceService.verifyAppStorePurchase({
          userId: order.userId,

          orderId: order.id,

          dto: {
            productId,

            transactionId,

            signedTransactionInfo,
          },
        });

      return {
        action: 'course_order_completed_from_notification',

        matched: true,

        orderId: order.id,

        completion,
      };
    }

    const order = await this.storeOrderRepository.findOne({
      where: {
        id: match.orderId,
      },
    });

    if (!order) {
      return {
        action: 'package_order_not_found',

        matched: false,
      };
    }

    if (
      order.status === StoreOrderStatus.COMPLETED ||
      order.status === StoreOrderStatus.REFUNDED
    ) {
      return {
        action: 'package_order_already_finalized',

        matched: true,

        orderId: order.id,

        status: order.status,
      };
    }

    const completion = await this.packageStoreService.verifyAppStorePurchase({
      userId: order.userId,

      orderId: order.id,

      dto: {
        productId,

        transactionId,

        signedTransactionInfo,
      },
    });

    return {
      action: 'package_order_completed_from_notification',

      matched: true,

      orderId: order.id,

      completion,
    };
  }

  private async revokeOneTimePurchase(params: {
    transaction: NonNullable<VerifiedAppStoreNotification['transaction']>;

    eventTime: Date;

    reason: string;

    enrollmentStatus: CourseEnrollmentStatus;
  }): Promise<Record<string, unknown>> {
    const match = await this.findOneTimeOrderMatch(params.transaction);

    if (!match) {
      return {
        action: 'refund_or_revoke_unmatched',

        matched: false,
      };
    }

    if (match.domain === 'course') {
      return this.revokeCourseOrder({
        orderId: match.orderId,

        eventTime: params.eventTime,

        reason: params.reason,

        enrollmentStatus: params.enrollmentStatus,

        transactionId: this.requiredString(
          params.transaction.transactionId,

          'App Store transactionId',
        ),
      });
    }

    return this.revokePackageOrder({
      orderId: match.orderId,

      eventTime: params.eventTime,

      reason: params.reason,

      transactionId: this.requiredString(
        params.transaction.transactionId,

        'App Store transactionId',
      ),
    });
  }

  private async restoreOneTimePurchase(params: {
    transaction: NonNullable<VerifiedAppStoreNotification['transaction']>;

    eventTime: Date;
  }): Promise<Record<string, unknown>> {
    const match = await this.findOneTimeOrderMatch(params.transaction);

    if (!match) {
      return {
        action: 'refund_reversal_unmatched',

        matched: false,
      };
    }

    const transactionId = this.requiredString(
      params.transaction.transactionId,

      'App Store transactionId',
    );

    if (match.domain === 'course') {
      return this.restoreCourseOrder({
        orderId: match.orderId,

        eventTime: params.eventTime,

        transactionId,
      });
    }

    return this.restorePackageOrder({
      orderId: match.orderId,

      eventTime: params.eventTime,

      transactionId,
    });
  }

  private async revokeCourseOrder(params: {
    orderId: string;
    eventTime: Date;
    reason: string;

    enrollmentStatus: CourseEnrollmentStatus;

    transactionId: string;
  }): Promise<Record<string, unknown>> {
    return this.dataSource.transaction(async (manager) => {
      const orderRepository = manager.getRepository(CoursePurchaseOrder);

      const enrollmentRepository = manager.getRepository(CourseEnrollment);

      const attemptRepository = manager.getRepository(CoursePaymentAttempt);

      const order = await orderRepository.findOne({
        where: {
          id: params.orderId,
        },

        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!order) {
        throw new NotFoundException('Course order not found.');
      }

      if (order.status === CoursePurchaseStatus.REFUNDED) {
        return {
          action: 'course_order_already_refunded',

          matched: true,

          orderId: order.id,
        };
      }

      if (order.status !== CoursePurchaseStatus.PAID) {
        return {
          action: 'course_order_had_no_active_entitlement',

          matched: true,

          orderId: order.id,

          status: order.status,
        };
      }

      order.status = CoursePurchaseStatus.REFUNDED;

      order.refundedAt = params.eventTime;

      await orderRepository.save(order);

      const enrollment = await enrollmentRepository.findOne({
        where: {
          userId: order.userId,

          courseId: order.courseId,

          orderId: order.id,
        },

        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (enrollment) {
        enrollment.status = params.enrollmentStatus;

        enrollment.refundedAt = params.eventTime;

        await enrollmentRepository.save(enrollment);
      }

      const providerReference = `apple-refund:${params.transactionId}`;

      const existingAttempt = await attemptRepository.findOne({
        where: {
          paymentProvider: CoursePaymentProvider.APP_STORE,

          providerReference,
        },
      });

      if (!existingAttempt) {
        await attemptRepository.save(
          attemptRepository.create({
            orderId: order.id,

            paymentProvider: CoursePaymentProvider.APP_STORE,

            status: CoursePaymentAttemptStatus.REFUNDED,

            providerReference,

            amount: order.paymentAmount,

            currency: order.paymentCurrency,

            failureCode: null,

            failureMessage: params.reason,

            completedAt: params.eventTime,
          }),
        );
      }

      return {
        action: 'course_entitlement_revoked',

        matched: true,

        orderId: order.id,

        enrollmentStatus: enrollment?.status ?? null,
      };
    });
  }

  private async restoreCourseOrder(params: {
    orderId: string;
    eventTime: Date;
    transactionId: string;
  }): Promise<Record<string, unknown>> {
    return this.dataSource.transaction(async (manager) => {
      const orderRepository = manager.getRepository(CoursePurchaseOrder);

      const enrollmentRepository = manager.getRepository(CourseEnrollment);

      const attemptRepository = manager.getRepository(CoursePaymentAttempt);

      const order = await orderRepository.findOne({
        where: {
          id: params.orderId,
        },

        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!order) {
        throw new NotFoundException('Course order not found.');
      }

      if (order.status === CoursePurchaseStatus.PAID) {
        return {
          action: 'course_entitlement_already_active',

          matched: true,

          orderId: order.id,
        };
      }

      if (order.status !== CoursePurchaseStatus.REFUNDED) {
        return {
          action: 'course_refund_reversal_not_applicable',

          matched: true,

          orderId: order.id,

          status: order.status,
        };
      }

      order.status = CoursePurchaseStatus.PAID;

      order.refundedAt = null;

      order.paidAt = order.paidAt ?? params.eventTime;

      await orderRepository.save(order);

      let enrollment = await enrollmentRepository.findOne({
        where: {
          userId: order.userId,

          courseId: order.courseId,
        },

        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!enrollment) {
        enrollment = enrollmentRepository.create({
          userId: order.userId,

          courseId: order.courseId,

          orderId: order.id,

          status: CourseEnrollmentStatus.ACTIVE,

          accessType: CourseAccessType.LIFETIME,

          enrolledAt: params.eventTime,

          expiresAt: null,

          refundedAt: null,

          lastAccessedAt: null,
        });
      } else {
        enrollment.orderId = order.id;

        enrollment.status = CourseEnrollmentStatus.ACTIVE;

        enrollment.accessType = CourseAccessType.LIFETIME;

        enrollment.refundedAt = null;

        enrollment.expiresAt = null;
      }

      await enrollmentRepository.save(enrollment);

      const providerReference = `apple-refund-reversed:${params.transactionId}`;

      const existingAttempt = await attemptRepository.findOne({
        where: {
          paymentProvider: CoursePaymentProvider.APP_STORE,

          providerReference,
        },
      });

      if (!existingAttempt) {
        await attemptRepository.save(
          attemptRepository.create({
            orderId: order.id,

            paymentProvider: CoursePaymentProvider.APP_STORE,

            status: CoursePaymentAttemptStatus.SUCCEEDED,

            providerReference,

            amount: order.paymentAmount,

            currency: order.paymentCurrency,

            failureCode: null,

            failureMessage: null,

            completedAt: params.eventTime,
          }),
        );
      }

      return {
        action: 'course_entitlement_restored',

        matched: true,

        orderId: order.id,
      };
    });
  }

  private async revokePackageOrder(params: {
    orderId: string;
    eventTime: Date;
    reason: string;
    transactionId: string;
  }): Promise<Record<string, unknown>> {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.getStoreOrderGraph(
        manager,
        params.orderId,
        true,
      );

      if (!order) {
        throw new NotFoundException('Package-store order not found.');
      }

      if (order.status === StoreOrderStatus.REFUNDED) {
        return {
          action: 'package_order_already_refunded',

          matched: true,

          orderId: order.id,
        };
      }

      if (order.status !== StoreOrderStatus.COMPLETED) {
        return {
          action: 'package_order_had_no_active_entitlement',

          matched: true,

          orderId: order.id,

          status: order.status,
        };
      }

      await this.walletService.reverseOrder(order, manager);

      order.status = StoreOrderStatus.REFUNDED;

      order.payment.refundedAt = params.eventTime;

      order.payment.refundReason = params.reason;

      await manager.getRepository(StoreOrder).save(order);

      await manager.getRepository(StoreOrderPayment).save(order.payment);

      const timelineRepository = manager.getRepository(StoreOrderTimelineEvent);

      await timelineRepository.save(
        timelineRepository.create({
          orderId: order.id,

          eventType: StoreTimelineEventType.REFUND_PROCESSED,

          title: 'App Store refund processed',

          description: params.reason,

          metadata: {
            provider: StorePaymentProvider.APP_STORE,

            transactionId: params.transactionId,

            reversedVoiceMinutes: order.reversal.reversedVoiceMinutes,

            reversedTextTokens: order.reversal.reversedTextTokens,

            reversedFreezeCount: order.reversal.reversedFreezeCount,

            reversedCvCredits: order.reversal.reversedCvCredits,
          },

          occurredAt: params.eventTime,
        }),
      );

      return {
        action: 'package_entitlement_revoked',

        matched: true,

        orderId: order.id,
      };
    });
  }

  private async restorePackageOrder(params: {
    orderId: string;
    eventTime: Date;
    transactionId: string;
  }): Promise<Record<string, unknown>> {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.getStoreOrderGraph(
        manager,
        params.orderId,
        true,
      );

      if (!order) {
        throw new NotFoundException('Package-store order not found.');
      }

      if (order.status === StoreOrderStatus.COMPLETED) {
        return {
          action: 'package_entitlement_already_active',

          matched: true,

          orderId: order.id,
        };
      }

      if (order.status !== StoreOrderStatus.REFUNDED) {
        return {
          action: 'package_refund_reversal_not_applicable',

          matched: true,

          orderId: order.id,

          status: order.status,
        };
      }

      await this.walletService.grantOrder(order, manager);

      order.status = StoreOrderStatus.COMPLETED;

      order.payment.refundedAt = null;

      order.payment.refundReason = null;

      order.payment.paidAt = order.payment.paidAt ?? params.eventTime;

      await manager.getRepository(StoreOrder).save(order);

      await manager.getRepository(StoreOrderPayment).save(order.payment);

      const timelineRepository = manager.getRepository(StoreOrderTimelineEvent);

      await timelineRepository.save(
        timelineRepository.create({
          orderId: order.id,

          eventType: StoreTimelineEventType.ENTITLEMENT_GRANTED,

          title: 'App Store refund reversed',

          description:
            'The App Store reversed the refund and the entitlement was restored.',

          metadata: {
            provider: StorePaymentProvider.APP_STORE,

            transactionId: params.transactionId,
          },

          occurredAt: params.eventTime,
        }),
      );

      return {
        action: 'package_entitlement_restored',

        matched: true,

        orderId: order.id,
      };
    });
  }

  private async findOneTimeOrderMatch(
    transaction: NonNullable<VerifiedAppStoreNotification['transaction']>,
  ): Promise<OneTimeOrderMatch | null> {
    /*
     * Preferred mapping:
     * Flutter passes backend order UUID as appAccountToken.
     */
    if (this.isUuid(transaction.appAccountToken)) {
      const courseOrder = await this.courseOrderRepository.findOne({
        where: {
          id: transaction.appAccountToken,

          paymentProvider: CoursePaymentProvider.APP_STORE,
        },
      });

      if (courseOrder) {
        return {
          domain: 'course',

          orderId: courseOrder.id,

          userId: courseOrder.userId,
        };
      }

      const storeOrder = await this.storeOrderRepository.findOne({
        where: {
          id: transaction.appAccountToken,
        },

        relations: {
          providerSnapshot: true,
        },
      });

      if (
        storeOrder?.providerSnapshot?.provider ===
        StorePaymentProvider.APP_STORE
      ) {
        return {
          domain: 'package_store',

          orderId: storeOrder.id,

          userId: storeOrder.userId,
        };
      }
    }

    /*
     * Fallback for an already verified transaction.
     */
    const references = [
      transaction.transactionId,

      transaction.originalTransactionId,
    ].filter((value): value is string => Boolean(value?.trim()));

    if (references.length === 0) {
      return null;
    }

    const courseTransactions = await this.courseTransactionRepository.find({
      where: {
        provider: CoursePaymentProvider.APP_STORE,

        providerTransactionId: In(references),
      },
    });

    const storeTransactions = await this.storeTransactionRepository.find({
      where: {
        provider: StorePaymentProvider.APP_STORE,

        providerTransactionId: In(references),
      },
    });

    if (courseTransactions.length + storeTransactions.length > 1) {
      throw new ConflictException(
        'App Store transaction matched more than one internal order.',
      );
    }

    if (courseTransactions.length === 1) {
      const order = await this.courseOrderRepository.findOne({
        where: {
          id: courseTransactions[0].orderId,
        },
      });

      return order
        ? {
            domain: 'course',

            orderId: order.id,

            userId: order.userId,
          }
        : null;
    }

    if (storeTransactions.length === 1) {
      const order = await this.storeOrderRepository.findOne({
        where: {
          id: storeTransactions[0].orderId,
        },
      });

      return order
        ? {
            domain: 'package_store',

            orderId: order.id,

            userId: order.userId,
          }
        : null;
    }

    return null;
  }

  private async getStoreOrderGraph(
    manager: EntityManager,
    orderId: string,
    lock: boolean,
  ): Promise<StoreOrder | null> {
    const query = manager
      .getRepository(StoreOrder)
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.snapshot', 'snapshot')
      .leftJoinAndSelect('order.payment', 'payment')
      .leftJoinAndSelect('order.reversal', 'reversal')
      .leftJoinAndSelect('order.providerSnapshot', 'providerSnapshot')
      .leftJoinAndSelect('order.providerTransaction', 'providerTransaction')
      .where('order.id = :orderId', {
        orderId,
      });

    if (lock) {
      query.setLock('pessimistic_write');
    }

    return query.getOne();
  }

  private async claimSpecificEvent(
    eventId: string,
  ): Promise<AppStoreServerNotificationEvent | null> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AppStoreServerNotificationEvent);

      const event = await repository.findOne({
        where: {
          id: eventId,
        },

        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (
        !event ||
        event.status === AppStoreNotificationEventStatus.PROCESSED
      ) {
        return null;
      }

      if (
        event.status === AppStoreNotificationEventStatus.PROCESSING &&
        event.processingStartedAt &&
        event.processingStartedAt.getTime() > Date.now() - 15 * 60 * 1000
      ) {
        return null;
      }

      event.status = AppStoreNotificationEventStatus.PROCESSING;

      event.attemptCount += 1;

      event.processingStartedAt = new Date();

      event.nextAttemptAt = null;

      return repository.save(event);
    });
  }

  private async claimNextEvent(): Promise<AppStoreServerNotificationEvent | null> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AppStoreServerNotificationEvent);

      const now = new Date();

      const staleBefore = new Date(now.getTime() - 15 * 60 * 1000);

      const event = await repository
        .createQueryBuilder('event')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where(
          new Brackets((where) => {
            where
              .where('event.status = :pending', {
                pending: AppStoreNotificationEventStatus.PENDING,
              })
              .orWhere(
                `(
                        event.status = :failed
                        AND event.nextAttemptAt <= :now
                      )`,
                {
                  failed: AppStoreNotificationEventStatus.FAILED,

                  now,
                },
              )
              .orWhere(
                `(
                        event.status = :processing
                        AND event.processingStartedAt <= :staleBefore
                      )`,
                {
                  processing: AppStoreNotificationEventStatus.PROCESSING,

                  staleBefore,
                },
              );
          }),
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

      event.status = AppStoreNotificationEventStatus.PROCESSING;

      event.attemptCount += 1;

      event.processingStartedAt = now;

      event.nextAttemptAt = null;

      return repository.save(event);
    });
  }

  private async markFailure(
    event: AppStoreServerNotificationEvent,

    error: unknown,
  ): Promise<void> {
    const current = await this.eventRepository.findOne({
      where: {
        id: event.id,
      },
    });

    if (!current) {
      return;
    }

    const deadLetter = current.attemptCount >= this.maxAttempts;

    current.status = deadLetter
      ? AppStoreNotificationEventStatus.DEAD_LETTER
      : AppStoreNotificationEventStatus.FAILED;

    current.lastErrorCode =
      error instanceof Error ? error.name.slice(0, 100) : 'UNKNOWN_ERROR';

    current.lastErrorMessage = this.errorMessage(error).slice(0, 1000);

    current.processingStartedAt = null;

    current.nextAttemptAt = deadLetter
      ? null
      : new Date(
          Date.now() + this.retryDelayMilliseconds(current.attemptCount),
        );

    await this.eventRepository.save(current);
  }

  private mapEnvironment(environment: string): StoreProviderEnvironment {
    if (environment === Environment.PRODUCTION) {
      return StoreProviderEnvironment.PRODUCTION;
    }

    if (environment === Environment.SANDBOX) {
      return StoreProviderEnvironment.SANDBOX;
    }

    return StoreProviderEnvironment.DEVELOPMENT;
  }

  private retryDelayMilliseconds(attemptCount: number): number {
    const seconds = Math.min(
      3600,

      30 * 2 ** Math.max(0, attemptCount - 1),
    );

    return seconds * 1000;
  }

  private requiredString(
    value: string | undefined,

    fieldName: string,
  ): string {
    const normalized = value?.trim();

    if (!normalized) {
      throw new ConflictException(`${fieldName} is missing.`);
    }

    return normalized;
  }

  private isUuid(value: string | undefined): value is string {
    return Boolean(
      value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
    );
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    return (
      (
        error.driverError as {
          code?: string;
        }
      ).code === '23505'
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Unknown App Store notification processing error.';
  }
}
