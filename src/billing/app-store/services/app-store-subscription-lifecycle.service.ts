import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Environment,
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
  NotificationTypeV2,
  Subtype,
  Type,
} from '@apple/app-store-server-library';
import { DataSource, EntityManager, Repository } from 'typeorm';

import {
  StoreSubscriptionEntitlementStatus,
  StoreSubscriptionRenewalEventType,
  StoreSubscriptionRenewalStatus,
  StoreSubscriptionStatus,
} from 'src/billing/types/google-play-subscription.type';

import { StoreSubscription } from 'src/billing/google-play-subscriptions/entities/store-subscription.entity';
import { StoreSubscriptionRenewal } from 'src/billing/google-play-subscriptions/entities/store-subscription-renewal.entity';

import { StoreOrder } from 'src/package-store/entities/store-order.entity';
import { UserStoreWallet } from 'src/package-store/entities/user-store-wallet.entity';

import {
  StoreBillingModel,
  StoreOrderStatus,
  StorePaymentProvider,
  StoreProviderEnvironment,
  StoreProviderProductType,
  StreakProtectionMode,
} from 'src/package-store/types/package-store.type';

import { AppStoreBillingService } from './app-store-billing.service';
import { AppStorePayloadCipherService } from './app-store-payload-cipher.service';

type OrderContext = {
  order: StoreOrder;
};

type ProjectedSubscriptionState = {
  status: StoreSubscriptionStatus;
  entitlementStatus: StoreSubscriptionEntitlementStatus;
  entitlementActive: boolean;
  autoRenewEnabled: boolean;

  expiresAt: Date | null;
  canceledAt: Date | null;
  revokedAt: Date | null;
  expiredAt: Date | null;

  cancellationReason: string | null;
};

export interface AppStoreSubscriptionSyncResult {
  matched: boolean;
  ignored: boolean;
  renewalRecorded: boolean;
  entitlementChanged: boolean;

  subscription: StoreSubscription | null;
}

@Injectable()
export class AppStoreSubscriptionLifecycleService {
  constructor(
    @InjectRepository(StoreSubscription)
    private readonly subscriptionRepository: Repository<StoreSubscription>,

    @InjectRepository(StoreSubscriptionRenewal)
    private readonly renewalRepository: Repository<StoreSubscriptionRenewal>,

    @InjectRepository(StoreOrder)
    private readonly orderRepository: Repository<StoreOrder>,

    private readonly dataSource: DataSource,

    private readonly appStoreBillingService: AppStoreBillingService,

    private readonly payloadCipherService: AppStorePayloadCipherService,
  ) {}

  async registerInitialPurchase(params: {
    initialOrderId: string;
    userId: string;
    transaction: JWSTransactionDecodedPayload;
  }): Promise<AppStoreSubscriptionSyncResult> {
    this.assertAutoRenewableTransaction(params.transaction);

    return this.syncSubscription({
      transaction: params.transaction,

      renewalInfo: null,

      notificationType: NotificationTypeV2.SUBSCRIBED,

      subtype: Subtype.INITIAL_BUY,

      appleStatus: 1,

      eventTime:
        this.dateFromMillis(params.transaction.signedDate) ?? new Date(),

      notificationEventId: null,

      initialOrderId: params.initialOrderId,

      expectedUserId: params.userId,
    });
  }

  async syncFromNotification(params: {
    transaction: JWSTransactionDecodedPayload;

    renewalInfo: JWSRenewalInfoDecodedPayload | null;

    notificationType: string;

    subtype: string | null;

    appleStatus: number | null;

    eventTime: Date;

    notificationEventId: string;
  }): Promise<AppStoreSubscriptionSyncResult> {
    this.assertAutoRenewableTransaction(params.transaction);

    return this.syncSubscription({
      ...params,

      initialOrderId: null,

      expectedUserId: null,
    });
  }

  async findByOriginalTransactionId(originalTransactionId: string) {
    const tokenHash = this.appStoreBillingService.hash(originalTransactionId);

    return this.subscriptionRepository.findOne({
      where: {
        provider: StorePaymentProvider.APP_STORE,

        purchaseTokenHash: tokenHash,
      },
    });
  }

  private async syncSubscription(params: {
    transaction: JWSTransactionDecodedPayload;

    renewalInfo: JWSRenewalInfoDecodedPayload | null;

    notificationType: string;

    subtype: string | null;

    appleStatus: number | null;

    eventTime: Date;

    notificationEventId: string | null;

    initialOrderId: string | null;

    expectedUserId: string | null;
  }): Promise<AppStoreSubscriptionSyncResult> {
    const transactionId = this.requiredString(
      params.transaction.transactionId,

      'App Store transactionId',
    );

    const originalTransactionId = this.requiredString(
      params.transaction.originalTransactionId,

      'App Store originalTransactionId',
    );

    const productId = this.requiredString(
      params.transaction.productId,

      'App Store productId',
    );

    const originalTransactionHash = this.appStoreBillingService.hash(
      originalTransactionId,
    );

    return this.dataSource.transaction(async (manager) => {
      const subscriptionRepository = manager.getRepository(StoreSubscription);

      let subscription = await subscriptionRepository.findOne({
        where: {
          provider: StorePaymentProvider.APP_STORE,

          purchaseTokenHash: originalTransactionHash,
        },

        lock: {
          mode: 'pessimistic_write',
        },
      });

      let orderContext: OrderContext | null = null;

      if (params.initialOrderId) {
        orderContext = await this.getOrderContext(
          manager,
          params.initialOrderId,
        );
      } else if (subscription) {
        orderContext = await this.getOrderContext(
          manager,
          subscription.initialOrderId,
        );
      } else if (this.isUuid(params.transaction.appAccountToken)) {
        orderContext = await this.getOrderContext(
          manager,

          params.transaction.appAccountToken!,

          false,
        );
      }

      if (!orderContext) {
        return {
          matched: false,
          ignored: false,
          renewalRecorded: false,
          entitlementChanged: false,
          subscription: null,
        };
      }

      this.assertSubscriptionOrder({
        context: orderContext,
        productId,

        expectedUserId: params.expectedUserId,
      });

      /*
       * Ignore an older notification arriving after
       * a newer notification was already processed.
       */
      if (
        subscription?.lastEventTime &&
        subscription.lastEventTime.getTime() > params.eventTime.getTime()
      ) {
        return {
          matched: true,
          ignored: true,
          renewalRecorded: false,
          entitlementChanged: false,
          subscription,
        };
      }

      const previousEntitlementActive =
        subscription?.entitlementActive ?? false;

      const projected = this.projectState({
        transaction: params.transaction,

        renewalInfo: params.renewalInfo,

        notificationType: params.notificationType,

        subtype: params.subtype,

        appleStatus: params.appleStatus,

        eventTime: params.eventTime,
      });

      /*
       * Store encrypted originalTransactionId.
       * Do not store raw Apple transaction identifiers
       * in the tokenCiphertext field.
       */
      const encryptedOriginalTransaction =
        this.payloadCipherService.encryptText(originalTransactionId);

      const environment = this.mapEnvironment(params.transaction.environment);

      const now = new Date();

      const rawState = this.buildRawState(
        params.notificationType,
        params.subtype,
        params.appleStatus,
      );

      const latestPayload = this.sanitizePayload({
        transaction: params.transaction,

        renewalInfo: params.renewalInfo,

        notificationType: params.notificationType,

        subtype: params.subtype,

        appleStatus: params.appleStatus,
      });

      if (!subscription) {
        subscription = subscriptionRepository.create({
          userId: orderContext.order.userId,

          packageId: orderContext.order.packageId,

          initialOrderId: orderContext.order.id,

          provider: StorePaymentProvider.APP_STORE,

          productId,

          /*
           * Apple has subscription groups,
           * but not Google Play basePlanId.
           */
          basePlanId: null,

          offerId: params.transaction.offerIdentifier ?? null,

          purchaseTokenHash: originalTransactionHash,

          linkedPurchaseTokenHash: null,

          previousPurchaseTokenHashes: [],

          tokenCiphertext: encryptedOriginalTransaction.ciphertext,

          tokenIv: encryptedOriginalTransaction.iv,

          tokenAuthTag: encryptedOriginalTransaction.authTag,

          latestOrderId: transactionId,

          status: projected.status,

          rawSubscriptionState: rawState,

          entitlementStatus: projected.entitlementStatus,

          entitlementActive: projected.entitlementActive,

          autoRenewEnabled: projected.autoRenewEnabled,

          startedAt:
            this.dateFromMillis(params.transaction.originalPurchaseDate) ??
            this.dateFromMillis(params.transaction.purchaseDate),

          expiresAt: projected.expiresAt,

          pausedResumeAt: null,

          canceledAt: projected.canceledAt,

          revokedAt: projected.revokedAt,

          expiredAt: projected.expiredAt,

          environment,

          isTestPurchase: environment === StoreProviderEnvironment.SANDBOX,

          regionCode: params.transaction.storefront?.slice(0, 8) ?? null,

          cancellationReason: projected.cancellationReason,

          /*
           * Apple notification types are strings,
           * while this existing column stores a
           * Google integer notification code.
           */
          lastNotificationType: null,

          lastRtdnEventId: params.notificationEventId,

          lastEventTime: params.eventTime,

          lastSyncedAt: now,

          cancelRequestedAt: null,

          cancelRequestedByAdminId: null,

          cancelRequestType: null,

          latestPayload,
        });
      } else {
        subscription.userId = orderContext.order.userId;

        subscription.packageId = orderContext.order.packageId;

        subscription.productId = productId;

        subscription.offerId = params.transaction.offerIdentifier ?? null;

        subscription.purchaseTokenHash = originalTransactionHash;

        subscription.tokenCiphertext = encryptedOriginalTransaction.ciphertext;

        subscription.tokenIv = encryptedOriginalTransaction.iv;

        subscription.tokenAuthTag = encryptedOriginalTransaction.authTag;

        subscription.latestOrderId = transactionId;

        subscription.status = projected.status;

        subscription.rawSubscriptionState = rawState;

        subscription.entitlementStatus = projected.entitlementStatus;

        subscription.entitlementActive = projected.entitlementActive;

        subscription.autoRenewEnabled = projected.autoRenewEnabled;

        subscription.startedAt =
          this.dateFromMillis(params.transaction.originalPurchaseDate) ??
          subscription.startedAt;

        subscription.expiresAt = projected.expiresAt;

        subscription.canceledAt = projected.canceledAt;

        subscription.revokedAt = projected.revokedAt;

        subscription.expiredAt = projected.expiredAt;

        subscription.environment = environment;

        subscription.isTestPurchase =
          environment === StoreProviderEnvironment.SANDBOX;

        subscription.regionCode =
          params.transaction.storefront?.slice(0, 8) ?? subscription.regionCode;

        subscription.cancellationReason = projected.cancellationReason;

        subscription.lastNotificationType = null;

        subscription.lastRtdnEventId = params.notificationEventId;

        subscription.lastEventTime = params.eventTime;

        subscription.lastSyncedAt = now;

        subscription.latestPayload = latestPayload;
      }

      subscription = await subscriptionRepository.save(subscription);

      const renewalRecorded = await this.upsertRenewal({
        manager,
        subscription,

        transaction: params.transaction,

        notificationType: params.notificationType,

        subtype: params.subtype,

        rawState,

        notificationEventId: params.notificationEventId,
      });

      await this.recomputeUnlimitedStreakProtection(
        subscription.userId,
        manager,
      );

      return {
        matched: true,

        ignored: false,

        renewalRecorded,

        entitlementChanged:
          previousEntitlementActive !== subscription.entitlementActive,

        subscription,
      };
    });
  }

  private async getOrderContext(
    manager: EntityManager,
    orderId: string,
    throwWhenMissing = true,
  ): Promise<OrderContext | null> {
    const order = await manager.getRepository(StoreOrder).findOne({
      where: {
        id: orderId,
      },

      relations: {
        snapshot: true,
        providerSnapshot: true,
        providerTransaction: true,
      },

      lock: {
        mode: 'pessimistic_read',
      },
    });

    if (!order && throwWhenMissing) {
      throw new NotFoundException('Package-store order not found.');
    }

    return order
      ? {
          order,
        }
      : null;
  }

  private assertSubscriptionOrder(params: {
    context: OrderContext;
    productId: string;
    expectedUserId: string | null;
  }): void {
    const order = params.context.order;

    if (params.expectedUserId && order.userId !== params.expectedUserId) {
      throw new BadRequestException(
        'App Store subscription order belongs to another user.',
      );
    }

    if (order.status !== StoreOrderStatus.COMPLETED) {
      throw new BadRequestException(
        'Subscription lifecycle registration requires a completed order.',
      );
    }

    if (!order.providerSnapshot || !order.snapshot) {
      throw new ConflictException(
        'Subscription order snapshot information is missing.',
      );
    }

    if (order.providerSnapshot.provider !== StorePaymentProvider.APP_STORE) {
      throw new BadRequestException('Order is not an App Store order.');
    }

    if (
      order.providerSnapshot.productType !==
      StoreProviderProductType.SUBSCRIPTION
    ) {
      throw new BadRequestException('Order is not a subscription product.');
    }

    if (order.providerSnapshot.productId !== params.productId) {
      throw new BadRequestException(
        'App Store subscription product does not match the ordered product.',
      );
    }

    if (
      order.snapshot.billingModel !== StoreBillingModel.MONTHLY ||
      order.snapshot.streakProtectionMode !==
        StreakProtectionMode.MONTHLY_UNLIMITED
    ) {
      throw new BadRequestException(
        'Only monthly unlimited streak-protection packages are supported.',
      );
    }
  }

  private projectState(params: {
    transaction: JWSTransactionDecodedPayload;

    renewalInfo: JWSRenewalInfoDecodedPayload | null;

    notificationType: string;

    subtype: string | null;

    appleStatus: number | null;

    eventTime: Date;
  }): ProjectedSubscriptionState {
    const now = new Date();

    const transactionExpiry = this.dateFromMillis(
      params.transaction.expiresDate,
    );

    const graceExpiry = this.dateFromMillis(
      params.renewalInfo?.gracePeriodExpiresDate,
    );

    const autoRenewEnabled = Number(params.renewalInfo?.autoRenewStatus) === 1;

    const cancellationReason = this.getCancellationReason(
      params.renewalInfo,
      params.subtype,
    );

    /*
     * Refund, revoke or App Store status 5:
     * entitlement must stop immediately.
     */
    if (
      params.transaction.revocationDate ||
      params.notificationType === NotificationTypeV2.REVOKE ||
      params.notificationType === NotificationTypeV2.REFUND ||
      params.appleStatus === 5
    ) {
      return {
        status: StoreSubscriptionStatus.REVOKED,

        entitlementStatus: StoreSubscriptionEntitlementStatus.ENDED,

        entitlementActive: false,

        autoRenewEnabled: false,

        expiresAt:
          this.dateFromMillis(params.transaction.revocationDate) ??
          params.eventTime,

        canceledAt: params.eventTime,

        revokedAt:
          this.dateFromMillis(params.transaction.revocationDate) ??
          params.eventTime,

        expiredAt: null,

        cancellationReason:
          cancellationReason ??
          (params.notificationType === NotificationTypeV2.REFUND
            ? 'refunded'
            : 'revoked'),
      };
    }

    /*
     * Apple has reversed a previous refund.
     */
    if (params.notificationType === NotificationTypeV2.REFUND_REVERSED) {
      const active = Boolean(
        transactionExpiry && transactionExpiry.getTime() > now.getTime(),
      );

      return {
        status: active
          ? StoreSubscriptionStatus.ACTIVE
          : StoreSubscriptionStatus.EXPIRED,

        entitlementStatus: active
          ? StoreSubscriptionEntitlementStatus.ACTIVE
          : StoreSubscriptionEntitlementStatus.ENDED,

        entitlementActive: active,

        autoRenewEnabled,

        expiresAt: transactionExpiry,

        canceledAt: null,

        revokedAt: null,

        expiredAt: active ? null : transactionExpiry,

        cancellationReason: null,
      };
    }

    const inGracePeriod =
      params.appleStatus === 4 || params.subtype === Subtype.GRACE_PERIOD;

    if (inGracePeriod) {
      const accessExpiry = this.latestDate(transactionExpiry, graceExpiry);

      const active = Boolean(
        accessExpiry && accessExpiry.getTime() > now.getTime(),
      );

      return {
        status: active
          ? StoreSubscriptionStatus.IN_GRACE_PERIOD
          : StoreSubscriptionStatus.EXPIRED,

        entitlementStatus: active
          ? StoreSubscriptionEntitlementStatus.ACTIVE
          : StoreSubscriptionEntitlementStatus.ENDED,

        entitlementActive: active,

        autoRenewEnabled,

        /*
         * During grace period the user keeps access
         * until gracePeriodExpiresDate.
         */
        expiresAt: accessExpiry,

        canceledAt: null,

        revokedAt: null,

        expiredAt: active ? null : accessExpiry,

        cancellationReason,
      };
    }

    /*
     * Apple status 3 or DID_FAIL_TO_RENEW/BILLING_RETRY.
     * Without grace period, suspend access.
     */
    if (
      params.appleStatus === 3 ||
      (params.notificationType === NotificationTypeV2.DID_FAIL_TO_RENEW &&
        params.subtype === Subtype.BILLING_RETRY)
    ) {
      return {
        status: StoreSubscriptionStatus.ON_HOLD,

        entitlementStatus: StoreSubscriptionEntitlementStatus.SUSPENDED,

        entitlementActive: false,

        autoRenewEnabled,

        expiresAt: transactionExpiry,

        canceledAt: null,

        revokedAt: null,

        expiredAt: null,

        cancellationReason: cancellationReason ?? 'billing_retry',
      };
    }

    if (
      params.notificationType === NotificationTypeV2.EXPIRED ||
      params.notificationType === NotificationTypeV2.GRACE_PERIOD_EXPIRED ||
      params.appleStatus === 2
    ) {
      return {
        status: StoreSubscriptionStatus.EXPIRED,

        entitlementStatus: StoreSubscriptionEntitlementStatus.ENDED,

        entitlementActive: false,

        autoRenewEnabled: false,

        expiresAt: transactionExpiry,

        canceledAt: null,

        revokedAt: null,

        expiredAt: transactionExpiry ?? params.eventTime,

        cancellationReason,
      };
    }

    /*
     * The user disabled renewal, but access remains
     * active through the paid expiry date.
     */
    if (
      params.notificationType ===
        NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS &&
      params.subtype === Subtype.AUTO_RENEW_DISABLED
    ) {
      const active = Boolean(
        transactionExpiry && transactionExpiry.getTime() > now.getTime(),
      );

      return {
        status: StoreSubscriptionStatus.CANCELED,

        entitlementStatus: active
          ? StoreSubscriptionEntitlementStatus.ACTIVE
          : StoreSubscriptionEntitlementStatus.ENDED,

        entitlementActive: active,

        autoRenewEnabled: false,

        expiresAt: transactionExpiry,

        canceledAt: params.eventTime,

        revokedAt: null,

        expiredAt: active ? null : transactionExpiry,

        cancellationReason: cancellationReason ?? 'auto_renew_disabled',
      };
    }

    const active = Boolean(
      transactionExpiry && transactionExpiry.getTime() > now.getTime(),
    );

    return {
      status: active
        ? StoreSubscriptionStatus.ACTIVE
        : StoreSubscriptionStatus.EXPIRED,

      entitlementStatus: active
        ? StoreSubscriptionEntitlementStatus.ACTIVE
        : StoreSubscriptionEntitlementStatus.ENDED,

      entitlementActive: active,

      autoRenewEnabled,

      expiresAt: transactionExpiry,

      canceledAt: null,

      revokedAt: null,

      expiredAt: active ? null : transactionExpiry,

      cancellationReason,
    };
  }

  private async upsertRenewal(params: {
    manager: EntityManager;

    subscription: StoreSubscription;

    transaction: JWSTransactionDecodedPayload;

    notificationType: string;

    subtype: string | null;

    rawState: string;

    notificationEventId: string | null;
  }): Promise<boolean> {
    const transactionId = this.requiredString(
      params.transaction.transactionId,

      'App Store transactionId',
    );

    const periodEnd = this.dateFromMillis(params.transaction.expiresDate);

    if (!periodEnd) {
      return false;
    }

    const repository = params.manager.getRepository(StoreSubscriptionRenewal);

    let renewal = await repository.findOne({
      where: {
        provider: StorePaymentProvider.APP_STORE,

        providerOrderId: transactionId,
      },

      lock: {
        mode: 'pessimistic_write',
      },
    });

    const wasCreated = !renewal;

    const renewalStatus = this.getRenewalStatus(params.notificationType);

    const price = this.convertApplePrice(params.transaction.price);

    if (!renewal) {
      renewal = repository.create({
        subscriptionId: params.subscription.id,

        provider: StorePaymentProvider.APP_STORE,

        providerOrderId: transactionId,

        productId: params.subscription.productId,

        basePlanId: null,

        offerId: params.transaction.offerIdentifier ?? null,

        eventType: this.getRenewalEventType(
          params.notificationType,
          params.subtype,
        ),

        status: renewalStatus,

        periodStart: this.dateFromMillis(params.transaction.purchaseDate),

        periodEnd,

        priceCurrency: params.transaction.currency ?? null,

        priceUnits: price.units,

        priceNanos: price.nanos,

        notificationType: null,

        rtdnEventId: params.notificationEventId,

        rawSubscriptionState: params.rawState,

        isTestPurchase:
          params.subscription.environment === StoreProviderEnvironment.SANDBOX,
      });
    } else {
      renewal.subscriptionId = params.subscription.id;

      renewal.productId = params.subscription.productId;

      renewal.offerId = params.transaction.offerIdentifier ?? null;

      renewal.eventType = this.getRenewalEventType(
        params.notificationType,
        params.subtype,
      );

      renewal.status = renewalStatus;

      renewal.periodStart =
        this.dateFromMillis(params.transaction.purchaseDate) ??
        renewal.periodStart;

      renewal.periodEnd = periodEnd;

      renewal.priceCurrency = params.transaction.currency ?? null;

      renewal.priceUnits = price.units;

      renewal.priceNanos = price.nanos;

      renewal.rtdnEventId = params.notificationEventId;

      renewal.rawSubscriptionState = params.rawState;

      renewal.isTestPurchase =
        params.subscription.environment === StoreProviderEnvironment.SANDBOX;
    }

    await repository.save(renewal);

    return wasCreated;
  }

  private async recomputeUnlimitedStreakProtection(
    userId: string,
    manager: EntityManager,
  ): Promise<Date | null> {
    const result = await manager
      .getRepository(StoreSubscription)
      .createQueryBuilder('subscription')
      .select('MAX(subscription.expiresAt)', 'maxExpiry')
      .where('subscription.userId = :userId', {
        userId,
      })
      .andWhere('subscription.entitlementActive = true')
      .andWhere('subscription.expiresAt > :now', {
        now: new Date(),
      })
      .getRawOne<{
        maxExpiry: string | Date | null;
      }>();

    const maxExpiry = result?.maxExpiry ? new Date(result.maxExpiry) : null;

    const walletRepository = manager.getRepository(UserStoreWallet);

    let wallet = await walletRepository.findOne({
      where: {
        userId,
      },

      lock: {
        mode: 'pessimistic_write',
      },
    });

    if (!wallet) {
      wallet = walletRepository.create({
        userId,

        aiVoiceMinutes: 0,

        aiVoiceSeconds: 0,

        aiTextTokens: 0,

        cvCredits: 0,

        signupCvCreditsGrantedAt: null,

        unlimitedStreakProtectionUntil: maxExpiry,
      });
    } else {
      wallet.unlimitedStreakProtectionUntil = maxExpiry;
    }

    await walletRepository.save(wallet);

    return maxExpiry;
  }

  private assertAutoRenewableTransaction(
    transaction: JWSTransactionDecodedPayload,
  ): void {
    if (transaction.type !== Type.AUTO_RENEWABLE_SUBSCRIPTION) {
      throw new BadRequestException(
        'App Store transaction is not an auto-renewable subscription.',
      );
    }

    this.requiredString(transaction.transactionId, 'App Store transactionId');

    this.requiredString(
      transaction.originalTransactionId,
      'App Store originalTransactionId',
    );

    this.requiredString(transaction.productId, 'App Store productId');
  }

  private getRenewalStatus(
    notificationType: string,
  ): StoreSubscriptionRenewalStatus {
    if (notificationType === NotificationTypeV2.REFUND) {
      return StoreSubscriptionRenewalStatus.REFUNDED;
    }

    if (notificationType === NotificationTypeV2.REVOKE) {
      return StoreSubscriptionRenewalStatus.REVOKED;
    }

    return StoreSubscriptionRenewalStatus.ACTIVE;
  }

  private getRenewalEventType(
    notificationType: string,
    subtype: string | null,
  ): StoreSubscriptionRenewalEventType {
    if (
      notificationType === NotificationTypeV2.SUBSCRIBED &&
      subtype === Subtype.INITIAL_BUY
    ) {
      return StoreSubscriptionRenewalEventType.INITIAL_PURCHASE;
    }

    if (
      notificationType === NotificationTypeV2.SUBSCRIBED &&
      subtype === Subtype.RESUBSCRIBE
    ) {
      return StoreSubscriptionRenewalEventType.RESTART;
    }

    if (notificationType === NotificationTypeV2.DID_RENEW) {
      return StoreSubscriptionRenewalEventType.RENEWAL;
    }

    if (
      notificationType === NotificationTypeV2.REFUND_REVERSED ||
      subtype === Subtype.BILLING_RECOVERY
    ) {
      return StoreSubscriptionRenewalEventType.RECOVERY;
    }

    return StoreSubscriptionRenewalEventType.MANUAL_SYNC;
  }

  private getCancellationReason(
    renewalInfo: JWSRenewalInfoDecodedPayload | null,

    subtype: string | null,
  ): string | null {
    if (renewalInfo?.expirationIntent !== undefined) {
      return (
        `expiration_intent_` + String(renewalInfo.expirationIntent)
      ).slice(0, 80);
    }

    return subtype ? subtype.toLowerCase().slice(0, 80) : null;
  }

  private sanitizePayload(params: {
    transaction: JWSTransactionDecodedPayload;

    renewalInfo: JWSRenewalInfoDecodedPayload | null;

    notificationType: string;

    subtype: string | null;

    appleStatus: number | null;
  }): Record<string, unknown> {
    return {
      notificationType: params.notificationType,

      subtype: params.subtype,

      appleStatus: params.appleStatus,

      transaction: {
        transactionId: params.transaction.transactionId ?? null,

        originalTransactionId: params.transaction.originalTransactionId ?? null,

        productId: params.transaction.productId ?? null,

        appAccountToken: params.transaction.appAccountToken ?? null,

        type: params.transaction.type ?? null,

        environment: params.transaction.environment ?? null,

        purchaseDate: this.isoFromMillis(params.transaction.purchaseDate),

        originalPurchaseDate: this.isoFromMillis(
          params.transaction.originalPurchaseDate,
        ),

        expiresDate: this.isoFromMillis(params.transaction.expiresDate),

        revocationDate: this.isoFromMillis(params.transaction.revocationDate),

        revocationReason: params.transaction.revocationReason ?? null,

        transactionReason: params.transaction.transactionReason ?? null,

        offerIdentifier: params.transaction.offerIdentifier ?? null,

        subscriptionGroupIdentifier:
          params.transaction.subscriptionGroupIdentifier ?? null,

        currency: params.transaction.currency ?? null,

        price: params.transaction.price ?? null,

        storefront: params.transaction.storefront ?? null,
      },

      renewalInfo: params.renewalInfo
        ? {
            originalTransactionId:
              params.renewalInfo.originalTransactionId ?? null,

            productId: params.renewalInfo.productId ?? null,

            autoRenewProductId: params.renewalInfo.autoRenewProductId ?? null,

            autoRenewStatus: params.renewalInfo.autoRenewStatus ?? null,

            expirationIntent: params.renewalInfo.expirationIntent ?? null,

            isInBillingRetryPeriod:
              params.renewalInfo.isInBillingRetryPeriod ?? false,

            gracePeriodExpiresDate: this.isoFromMillis(
              params.renewalInfo.gracePeriodExpiresDate,
            ),

            renewalDate: this.isoFromMillis(params.renewalInfo.renewalDate),

            environment: params.renewalInfo.environment ?? null,
          }
        : null,
    };
  }

  private mapEnvironment(
    environment: string | undefined,
  ): StoreProviderEnvironment {
    if (environment === Environment.PRODUCTION) {
      return StoreProviderEnvironment.PRODUCTION;
    }

    if (environment === Environment.SANDBOX) {
      return StoreProviderEnvironment.SANDBOX;
    }

    throw new BadRequestException(
      `Unsupported App Store environment: ${String(environment)}.`,
    );
  }

  private buildRawState(
    notificationType: string,
    subtype: string | null,
    appleStatus: number | null,
  ): string {
    return [
      notificationType,

      subtype ?? 'none',

      appleStatus === null ? 'unknown' : String(appleStatus),
    ]
      .join(':')
      .slice(0, 80);
  }

  /*
   * Apple transaction price uses milliunits.
   * Convert them into units + nanos.
   */
  private convertApplePrice(price: number | undefined): {
    units: string | null;
    nanos: number | null;
  } {
    if (!Number.isSafeInteger(price) || price! < 0) {
      return {
        units: null,
        nanos: null,
      };
    }

    return {
      units: String(Math.floor(price! / 1000)),

      nanos: (price! % 1000) * 1_000_000,
    };
  }

  private latestDate(...values: Array<Date | null>): Date | null {
    const valid = values.filter((value): value is Date => Boolean(value));

    if (valid.length === 0) {
      return null;
    }

    return new Date(Math.max(...valid.map((value) => value.getTime())));
  }

  private requiredString(
    value: string | undefined,

    fieldName: string,
  ): string {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException(`${fieldName} is missing.`);
    }

    return normalized;
  }

  private dateFromMillis(value: number | undefined): Date | null {
    if (!Number.isFinite(value)) {
      return null;
    }

    const date = new Date(value!);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private isoFromMillis(value: number | undefined): string | null {
    return this.dateFromMillis(value)?.toISOString() ?? null;
  }

  private isUuid(value: string | undefined): value is string {
    return Boolean(
      value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
    );
  }
}
