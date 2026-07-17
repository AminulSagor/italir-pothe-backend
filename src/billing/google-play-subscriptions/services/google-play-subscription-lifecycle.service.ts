import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';

import { GooglePlayBillingService } from 'src/billing/google-play/google-play-billing.service';
import type {
  GooglePlaySubscriptionLineItem,
  GooglePlaySubscriptionPurchaseV2,
  GooglePlaySubscriptionState,
} from 'src/billing/types/google-play-billing.type';
import { GooglePlaySubscriptionNotificationType } from 'src/billing/types/google-play-rtdn.type';
import {
  GooglePlayDeveloperCancellationType,
  StoreSubscriptionEntitlementStatus,
  StoreSubscriptionRenewalEventType,
  StoreSubscriptionRenewalStatus,
  StoreSubscriptionStatus,
} from 'src/billing/types/google-play-subscription.type';

import { StoreOrder } from 'src/package-store/entities/store-order.entity';
import { StoreOrderProviderTransaction } from 'src/package-store/entities/store-order-provider-transaction.entity';
import { UserStoreWallet } from 'src/package-store/entities/user-store-wallet.entity';
import {
  StoreBillingModel,
  StoreOrderStatus,
  StorePaymentProvider,
  StoreProviderEnvironment,
  StoreProviderProductType,
  StreakProtectionMode,
} from 'src/package-store/types/package-store.type';

import type { AdminStoreSubscriptionQueryDto } from '../dto/admin-google-play-subscription.dto';
import { StoreSubscriptionRenewal } from '../entities/store-subscription-renewal.entity';
import { StoreSubscription } from '../entities/store-subscription.entity';
import { GooglePlaySubscriptionTokenCipherService } from './google-play-subscription-token-cipher.service';

type OrderContext = {
  order: StoreOrder;
  providerTransaction: StoreOrderProviderTransaction;
};

type SubscriptionStateProjection = {
  status: StoreSubscriptionStatus;
  entitlementStatus: StoreSubscriptionEntitlementStatus;
  entitlementActive: boolean;
  canceledAt: Date | null;
  revokedAt: Date | null;
  expiredAt: Date | null;
  cancellationReason: string | null;
};

export interface StoreSubscriptionResponse {
  id: string;
  userId: string;
  packageId: string;
  initialOrderId: string;
  provider: StorePaymentProvider;
  productId: string;
  basePlanId: string | null;
  offerId: string | null;
  latestOrderId: string | null;
  status: StoreSubscriptionStatus;
  rawSubscriptionState: string;
  entitlementStatus: StoreSubscriptionEntitlementStatus;
  entitlementActive: boolean;
  autoRenewEnabled: boolean;
  startedAt: Date | null;
  expiresAt: Date | null;
  pausedResumeAt: Date | null;
  canceledAt: Date | null;
  revokedAt: Date | null;
  expiredAt: Date | null;
  environment: StoreProviderEnvironment;
  isTestPurchase: boolean;
  regionCode: string | null;
  cancellationReason: string | null;
  lastNotificationType: number | null;
  lastRtdnEventId: string | null;
  lastEventTime: Date | null;
  lastSyncedAt: Date;
  cancelRequestedAt: Date | null;
  cancelRequestedByAdminId: string | null;
  cancelRequestType: GooglePlayDeveloperCancellationType | null;
  latestPayload: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionSyncResult {
  matched: boolean;
  ignored: boolean;
  subscription: StoreSubscriptionResponse | null;
  renewalRecorded: boolean;
  sanitizedPayload: Record<string, unknown> | null;
}

@Injectable()
export class GooglePlaySubscriptionLifecycleService {
  constructor(
    @InjectRepository(StoreSubscription)
    private readonly subscriptionRepository: Repository<StoreSubscription>,

    @InjectRepository(StoreSubscriptionRenewal)
    private readonly renewalRepository: Repository<StoreSubscriptionRenewal>,

    @InjectRepository(StoreOrder)
    private readonly orderRepository: Repository<StoreOrder>,

    @InjectRepository(StoreOrderProviderTransaction)
    private readonly providerTransactionRepository: Repository<StoreOrderProviderTransaction>,

    private readonly dataSource: DataSource,

    private readonly googlePlayBillingService: GooglePlayBillingService,

    private readonly tokenCipherService: GooglePlaySubscriptionTokenCipherService,
  ) {}

  async registerInitialPurchase(params: {
    initialOrderId: string;
    userId: string;
    purchaseToken: string;
    eventTime?: Date;
  }): Promise<SubscriptionSyncResult> {
    const purchase =
      await this.googlePlayBillingService.getSubscriptionPurchaseByToken({
        purchaseToken: params.purchaseToken,
      });

    return this.syncSubscription({
      purchaseToken: params.purchaseToken,
      purchase,
      notificationType: GooglePlaySubscriptionNotificationType.PURCHASED,
      eventTime: params.eventTime ?? new Date(),
      rtdnEventId: null,
      initialOrderId: params.initialOrderId,
      expectedUserId: params.userId,
    });
  }

  async syncFromRtdn(params: {
    purchaseToken: string;
    notificationType: GooglePlaySubscriptionNotificationType;
    eventTime: Date;
    rtdnEventId: string | null;
    authoritativePurchase?: GooglePlaySubscriptionPurchaseV2;
    initialOrderId?: string | null;
  }): Promise<SubscriptionSyncResult> {
    const purchase =
      params.authoritativePurchase ??
      (await this.googlePlayBillingService.getSubscriptionPurchaseByToken({
        purchaseToken: params.purchaseToken,
      }));

    return this.syncSubscription({
      purchaseToken: params.purchaseToken,
      purchase,
      notificationType: params.notificationType,
      eventTime: params.eventTime,
      rtdnEventId: params.rtdnEventId,
      initialOrderId: params.initialOrderId ?? null,
      expectedUserId: null,
    });
  }

  async markPendingPurchaseCanceled(params: {
    purchaseToken: string;
    eventTime: Date;
    rtdnEventId: string | null;
  }): Promise<SubscriptionSyncResult> {
    const tokenHash = this.googlePlayBillingService.hashPurchaseToken(
      params.purchaseToken,
    );

    return this.dataSource.transaction(async (manager) => {
      const subscription = await this.findSubscriptionByAnyTokenHash(
        manager,
        tokenHash,
        null,
        true,
      );

      if (!subscription) {
        return {
          matched: false,
          ignored: false,
          subscription: null,
          renewalRecorded: false,
          sanitizedPayload: null,
        };
      }

      if (
        subscription.lastEventTime &&
        subscription.lastEventTime.getTime() > params.eventTime.getTime()
      ) {
        return {
          matched: true,
          ignored: true,
          subscription: this.mapSubscription(subscription),
          renewalRecorded: false,
          sanitizedPayload: subscription.latestPayload,
        };
      }

      subscription.status = StoreSubscriptionStatus.PENDING_PURCHASE_CANCELED;

      subscription.rawSubscriptionState =
        'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED';

      subscription.entitlementStatus = StoreSubscriptionEntitlementStatus.ENDED;

      subscription.entitlementActive = false;
      subscription.autoRenewEnabled = false;

      subscription.lastNotificationType =
        GooglePlaySubscriptionNotificationType.PENDING_PURCHASE_CANCELED;

      subscription.lastRtdnEventId = params.rtdnEventId;

      subscription.lastEventTime = params.eventTime;

      subscription.lastSyncedAt = new Date();

      await manager.getRepository(StoreSubscription).save(subscription);

      await this.recomputeUnlimitedStreakProtection(
        subscription.userId,
        manager,
      );

      return {
        matched: true,
        ignored: false,
        subscription: this.mapSubscription(subscription),
        renewalRecorded: false,
        sanitizedPayload: subscription.latestPayload,
      };
    });
  }

  async applyVoidedPurchase(params: {
    purchaseToken: string;
    providerOrderId: string;
    eventTime: Date;
    rtdnEventId: string | null;
  }): Promise<{
    matched: boolean;
    initialOrderId: string | null;
    isInitialOrder: boolean;
    entitlementRevoked: boolean;
    subscription: StoreSubscriptionResponse | null;
  }> {
    const tokenHash = this.googlePlayBillingService.hashPurchaseToken(
      params.purchaseToken,
    );

    return this.dataSource.transaction(async (manager) => {
      const subscriptionRepository = manager.getRepository(StoreSubscription);

      const renewalRepository = manager.getRepository(StoreSubscriptionRenewal);

      let renewal = await renewalRepository.findOne({
        where: {
          provider: StorePaymentProvider.GOOGLE_PLAY,
          providerOrderId: params.providerOrderId,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      let subscription: StoreSubscription | null = null;

      if (renewal) {
        subscription = await subscriptionRepository.findOne({
          where: {
            provider: StorePaymentProvider.GOOGLE_PLAY,
            id: renewal.subscriptionId,
          },
          lock: {
            mode: 'pessimistic_write',
          },
        });
      }

      if (!subscription) {
        subscription = await this.findSubscriptionByAnyTokenHash(
          manager,
          tokenHash,
          params.providerOrderId,
          true,
        );
      }

      if (!subscription) {
        return {
          matched: false,
          initialOrderId: null,
          isInitialOrder: false,
          entitlementRevoked: false,
          subscription: null,
        };
      }

      if (!renewal) {
        renewal = await renewalRepository.findOne({
          where: {
            subscriptionId: subscription.id,
            provider: StorePaymentProvider.GOOGLE_PLAY,
            providerOrderId: params.providerOrderId,
          },
          lock: {
            mode: 'pessimistic_write',
          },
        });
      }

      const isInitialOrder = await this.isInitialProviderOrder(
        manager,
        subscription,
        params.providerOrderId,
      );

      if (renewal) {
        renewal.status = StoreSubscriptionRenewalStatus.REFUNDED;

        renewal.rtdnEventId = params.rtdnEventId;

        await renewalRepository.save(renewal);
      }

      const latestActiveRenewal = await renewalRepository
        .createQueryBuilder('renewal')
        .where('renewal.subscriptionId = :subscriptionId', {
          subscriptionId: subscription.id,
        })
        .andWhere('renewal.status = :status', {
          status: StoreSubscriptionRenewalStatus.ACTIVE,
        })
        .andWhere('renewal.periodEnd > :now', {
          now: new Date(),
        })
        .orderBy('renewal.periodEnd', 'DESC')
        .getOne();

      const shouldRevoke = isInitialOrder || !latestActiveRenewal;

      if (shouldRevoke) {
        subscription.status = StoreSubscriptionStatus.REVOKED;

        subscription.rawSubscriptionState = 'SUBSCRIPTION_STATE_REVOKED';

        subscription.entitlementStatus =
          StoreSubscriptionEntitlementStatus.ENDED;

        subscription.entitlementActive = false;
        subscription.autoRenewEnabled = false;

        subscription.revokedAt = params.eventTime;

        subscription.expiresAt = params.eventTime;
      } else {
        subscription.expiresAt = latestActiveRenewal.periodEnd;

        subscription.entitlementActive = true;

        subscription.entitlementStatus =
          StoreSubscriptionEntitlementStatus.ACTIVE;
      }

      subscription.lastRtdnEventId = params.rtdnEventId;

      subscription.lastEventTime = params.eventTime;

      subscription.lastSyncedAt = new Date();

      await subscriptionRepository.save(subscription);

      await this.recomputeUnlimitedStreakProtection(
        subscription.userId,
        manager,
      );

      return {
        matched: true,

        initialOrderId: subscription.initialOrderId,

        isInitialOrder,

        entitlementRevoked: shouldRevoke,

        subscription: this.mapSubscription(subscription),
      };
    });
  }

  async findAll(query: AdminStoreSubscriptionQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.subscriptionRepository
      .createQueryBuilder('subscription')
      .orderBy('subscription.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere('subscription.status = :status', {
        status: query.status,
      });
    }

    if (query.userId) {
      qb.andWhere('subscription.userId = :userId', {
        userId: query.userId,
      });
    }

    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;

      qb.andWhere(
        new Brackets((where) => {
          where
            .where('subscription.productId ILIKE :search', { search })
            .orWhere('subscription.latestOrderId ILIKE :search', { search });
        }),
      );
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((item) => this.mapSubscription(item)),

      pagination: {
        page,
        limit,
        total,

        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findById(subscriptionId: string) {
    const subscription = await this.subscriptionRepository.findOne({
      where: {
        id: subscriptionId,
      },
    });

    if (!subscription) {
      throw new NotFoundException('Store subscription not found.');
    }

    const renewals = await this.renewalRepository.find({
      where: {
        subscriptionId,
      },
      order: {
        periodEnd: 'DESC',
      },
    });

    return {
      subscription: this.mapSubscription(subscription),

      renewals,
    };
  }

  async findCurrentStreakProtectionForUser(
    userId: string,
    manager?: EntityManager,
  ): Promise<StoreSubscriptionResponse | null> {
    const repository = manager
      ? manager.getRepository(StoreSubscription)
      : this.subscriptionRepository;

    const subscription = await repository
      .createQueryBuilder('subscription')
      .where('subscription.userId = :userId', {
        userId,
      })
      .andWhere('subscription.provider = :provider', {
        provider: StorePaymentProvider.GOOGLE_PLAY,
      })
      .andWhere('subscription.entitlementActive = :active', {
        active: true,
      })
      .andWhere('subscription.expiresAt IS NOT NULL')
      .andWhere('subscription.expiresAt > :now', {
        now: new Date(),
      })
      .orderBy('subscription.expiresAt', 'DESC')
      .addOrderBy('subscription.updatedAt', 'DESC')
      .getOne();

    return subscription ? this.mapSubscription(subscription) : null;
  }

  async cancelSubscription(params: {
    subscriptionId: string;
    adminUserId: string;
    cancellationType: GooglePlayDeveloperCancellationType;
  }) {
    const subscription = await this.subscriptionRepository.findOne({
      where: {
        id: params.subscriptionId,
      },
    });

    if (!subscription) {
      throw new NotFoundException('Store subscription not found.');
    }

    if (subscription.provider !== StorePaymentProvider.GOOGLE_PLAY) {
      throw new BadRequestException(
        'Only Google Play subscriptions can use this endpoint.',
      );
    }

    const purchaseToken = this.tokenCipherService.decrypt({
      ciphertext: subscription.tokenCiphertext,

      iv: subscription.tokenIv,

      authTag: subscription.tokenAuthTag,
    });

    await this.googlePlayBillingService.cancelSubscription({
      purchaseToken,

      cancellationType: params.cancellationType,
    });

    await this.subscriptionRepository.update(
      {
        id: subscription.id,
      },
      {
        cancelRequestedAt: new Date(),

        cancelRequestedByAdminId: params.adminUserId,

        cancelRequestType: params.cancellationType,
      },
    );

    const purchase =
      await this.googlePlayBillingService.getSubscriptionPurchaseByToken({
        purchaseToken,
      });

    return this.syncSubscription({
      purchaseToken,
      purchase,

      notificationType: GooglePlaySubscriptionNotificationType.CANCELED,

      eventTime: new Date(),

      rtdnEventId: null,

      initialOrderId: subscription.initialOrderId,

      expectedUserId: subscription.userId,
    });
  }

  async recomputeUserEntitlement(userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const expiry = await this.recomputeUnlimitedStreakProtection(
        userId,
        manager,
      );

      return {
        userId,

        unlimitedStreakProtectionUntil: expiry,
      };
    });
  }

  private async syncSubscription(params: {
    purchaseToken: string;

    purchase: GooglePlaySubscriptionPurchaseV2;

    notificationType: GooglePlaySubscriptionNotificationType;

    eventTime: Date;

    rtdnEventId: string | null;

    initialOrderId: string | null;

    expectedUserId: string | null;
  }): Promise<SubscriptionSyncResult> {
    const tokenHash = this.googlePlayBillingService.hashPurchaseToken(
      params.purchaseToken,
    );

    const linkedTokenHash = params.purchase.linkedPurchaseToken
      ? this.googlePlayBillingService.hashPurchaseToken(
          params.purchase.linkedPurchaseToken,
        )
      : null;

    return this.dataSource.transaction(async (manager) => {
      const subscriptionRepository = manager.getRepository(StoreSubscription);

      let subscription = await this.findSubscriptionByAnyTokenHash(
        manager,
        tokenHash,
        linkedTokenHash,
        true,
      );

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
      } else {
        orderContext = await this.findOrderContextByTokenHashes(
          manager,
          tokenHash,
          linkedTokenHash,
        );
      }

      if (!orderContext) {
        return {
          matched: false,
          ignored: false,
          subscription: null,
          renewalRecorded: false,

          sanitizedPayload: this.sanitizePurchase(params.purchase),
        };
      }

      this.assertSubscriptionOrder(orderContext, params.expectedUserId);

      const lineItem = this.selectLineItem(
        params.purchase,
        orderContext.order.providerSnapshot.productId,
      );

      const expiresAt = this.parseRequiredDate(
        lineItem.expiryTime,
        'Google Play subscription expiry time',
      );

      if (
        subscription?.lastEventTime &&
        subscription.lastEventTime.getTime() > params.eventTime.getTime()
      ) {
        return {
          matched: true,
          ignored: true,

          subscription: this.mapSubscription(subscription),

          renewalRecorded: false,

          sanitizedPayload: subscription.latestPayload,
        };
      }

      const stateProjection = this.projectState({
        rawState:
          params.purchase.subscriptionState ?? 'SUBSCRIPTION_STATE_UNSPECIFIED',

        notificationType: params.notificationType,

        expiresAt,

        purchase: params.purchase,

        eventTime: params.eventTime,
      });

      const encrypted = this.tokenCipherService.encrypt(params.purchaseToken);

      const sanitizedPayload = this.sanitizePurchase(params.purchase);

      const latestOrderId =
        lineItem.latestSuccessfulOrderId ??
        params.purchase.latestOrderId ??
        null;

      const environment = params.purchase.testPurchase
        ? StoreProviderEnvironment.SANDBOX
        : StoreProviderEnvironment.PRODUCTION;

      const now = new Date();

      if (!subscription) {
        subscription = subscriptionRepository.create({
          userId: orderContext.order.userId,

          packageId: orderContext.order.packageId,

          initialOrderId: orderContext.order.id,

          provider: StorePaymentProvider.GOOGLE_PLAY,

          productId: lineItem.productId!,

          basePlanId: lineItem.offerDetails?.basePlanId ?? null,

          offerId: lineItem.offerDetails?.offerId ?? null,

          purchaseTokenHash: tokenHash,

          linkedPurchaseTokenHash: linkedTokenHash,

          previousPurchaseTokenHashes: [],

          tokenCiphertext: encrypted.ciphertext,

          tokenIv: encrypted.iv,

          tokenAuthTag: encrypted.authTag,

          latestOrderId,

          status: stateProjection.status,

          rawSubscriptionState:
            params.purchase.subscriptionState ??
            'SUBSCRIPTION_STATE_UNSPECIFIED',

          entitlementStatus: stateProjection.entitlementStatus,

          entitlementActive: stateProjection.entitlementActive,

          autoRenewEnabled:
            lineItem.autoRenewingPlan?.autoRenewEnabled ?? false,

          startedAt: this.parseOptionalDate(params.purchase.startTime),

          expiresAt,

          pausedResumeAt: this.parseOptionalDate(
            params.purchase.pausedStateContext?.autoResumeTime,
          ),

          canceledAt: stateProjection.canceledAt,

          revokedAt: stateProjection.revokedAt,

          expiredAt: stateProjection.expiredAt,

          environment,

          isTestPurchase: Boolean(params.purchase.testPurchase),

          regionCode: params.purchase.regionCode ?? null,

          cancellationReason: stateProjection.cancellationReason,

          lastNotificationType: params.notificationType,

          lastRtdnEventId: params.rtdnEventId,

          lastEventTime: params.eventTime,

          lastSyncedAt: now,

          cancelRequestedAt: null,

          cancelRequestedByAdminId: null,

          cancelRequestType: null,

          latestPayload: sanitizedPayload,
        });
      } else {
        const previousHashes = new Set(
          subscription.previousPurchaseTokenHashes ?? [],
        );

        if (subscription.purchaseTokenHash !== tokenHash) {
          previousHashes.add(subscription.purchaseTokenHash);
        }

        subscription.userId = orderContext.order.userId;

        subscription.packageId = orderContext.order.packageId;

        subscription.productId = lineItem.productId!;

        subscription.basePlanId = lineItem.offerDetails?.basePlanId ?? null;

        subscription.offerId = lineItem.offerDetails?.offerId ?? null;

        subscription.purchaseTokenHash = tokenHash;

        subscription.linkedPurchaseTokenHash = linkedTokenHash;

        subscription.previousPurchaseTokenHashes = [...previousHashes];

        subscription.tokenCiphertext = encrypted.ciphertext;

        subscription.tokenIv = encrypted.iv;

        subscription.tokenAuthTag = encrypted.authTag;

        subscription.latestOrderId = latestOrderId;

        subscription.status = stateProjection.status;

        subscription.rawSubscriptionState =
          params.purchase.subscriptionState ?? 'SUBSCRIPTION_STATE_UNSPECIFIED';

        subscription.entitlementStatus = stateProjection.entitlementStatus;

        subscription.entitlementActive = stateProjection.entitlementActive;

        subscription.autoRenewEnabled =
          lineItem.autoRenewingPlan?.autoRenewEnabled ?? false;

        subscription.startedAt =
          this.parseOptionalDate(params.purchase.startTime) ??
          subscription.startedAt;

        subscription.expiresAt = expiresAt;

        subscription.pausedResumeAt = this.parseOptionalDate(
          params.purchase.pausedStateContext?.autoResumeTime,
        );

        subscription.canceledAt = stateProjection.canceledAt;

        subscription.revokedAt = stateProjection.revokedAt;

        subscription.expiredAt = stateProjection.expiredAt;

        subscription.environment = environment;

        subscription.isTestPurchase = Boolean(params.purchase.testPurchase);

        subscription.regionCode = params.purchase.regionCode ?? null;

        subscription.cancellationReason = stateProjection.cancellationReason;

        subscription.lastNotificationType = params.notificationType;

        subscription.lastRtdnEventId = params.rtdnEventId;

        subscription.lastEventTime = params.eventTime;

        subscription.lastSyncedAt = now;

        subscription.latestPayload = sanitizedPayload;
      }

      subscription = await subscriptionRepository.save(subscription);

      const renewalRecorded = await this.upsertRenewal({
        manager,
        subscription,
        lineItem,
        purchase: params.purchase,
        notificationType: params.notificationType,
        rtdnEventId: params.rtdnEventId,
      });

      await this.recomputeUnlimitedStreakProtection(
        subscription.userId,
        manager,
      );

      return {
        matched: true,
        ignored: false,

        subscription: this.mapSubscription(subscription),

        renewalRecorded,

        sanitizedPayload,
      };
    });
  }

  private async findSubscriptionByAnyTokenHash(
    manager: EntityManager,
    tokenHash: string,
    linkedTokenHash: string | null,
    lock: boolean,
  ): Promise<StoreSubscription | null> {
    const qb = manager
      .getRepository(StoreSubscription)
      .createQueryBuilder('subscription')
      .where(
        new Brackets((where) => {
          where
            .where('subscription.purchaseTokenHash = :tokenHash', { tokenHash })
            .orWhere('subscription.linkedPurchaseTokenHash = :tokenHash', {
              tokenHash,
            })
            .orWhere(
              'subscription.previousPurchaseTokenHashes @> :tokenHashes::jsonb',
              {
                tokenHashes: JSON.stringify([tokenHash]),
              },
            );

          if (linkedTokenHash) {
            where
              .orWhere('subscription.purchaseTokenHash = :linkedTokenHash', {
                linkedTokenHash,
              })
              .orWhere(
                'subscription.linkedPurchaseTokenHash = :linkedTokenHash',
                { linkedTokenHash },
              )
              .orWhere(
                'subscription.previousPurchaseTokenHashes @> :linkedTokenHashes::jsonb',
                {
                  linkedTokenHashes: JSON.stringify([linkedTokenHash]),
                },
              );
          }
        }),
      );

    if (lock) {
      qb.setLock('pessimistic_write');
    }

    return qb.getOne();
  }

  private async findOrderContextByTokenHashes(
    manager: EntityManager,
    tokenHash: string,
    linkedTokenHash: string | null,
  ): Promise<OrderContext | null> {
    const hashes = [tokenHash, linkedTokenHash].filter(
      (value): value is string => Boolean(value),
    );

    const transactions = await manager
      .getRepository(StoreOrderProviderTransaction)
      .createQueryBuilder('transaction')
      .where('transaction.provider = :provider', {
        provider: StorePaymentProvider.GOOGLE_PLAY,
      })
      .andWhere('transaction.tokenHash IN (:...hashes)', { hashes })
      .getMany();

    if (transactions.length > 1) {
      throw new ConflictException(
        'Subscription token matched more than one package-store order.',
      );
    }

    if (transactions.length === 0) {
      return null;
    }

    return this.getOrderContext(manager, transactions[0].orderId);
  }

  private async getOrderContext(
    manager: EntityManager,
    orderId: string,
  ): Promise<OrderContext> {
    const order = await manager.getRepository(StoreOrder).findOne({
      where: {
        id: orderId,
      },

      relations: {
        snapshot: true,
        providerSnapshot: true,
        providerTransaction: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Package-store order not found.');
    }

    if (!order.providerTransaction) {
      throw new ConflictException(
        'Package-store order is missing its provider transaction.',
      );
    }

    return {
      order,

      providerTransaction: order.providerTransaction,
    };
  }

  private assertSubscriptionOrder(
    context: OrderContext,
    expectedUserId: string | null,
  ): void {
    const { order, providerTransaction } = context;

    if (expectedUserId && order.userId !== expectedUserId) {
      throw new BadRequestException(
        'Subscription order belongs to another user.',
      );
    }

    if (order.status !== StoreOrderStatus.COMPLETED) {
      throw new BadRequestException(
        'Subscription lifecycle can only be registered after order completion.',
      );
    }

    if (
      order.providerSnapshot.provider !== StorePaymentProvider.GOOGLE_PLAY ||
      providerTransaction.provider !== StorePaymentProvider.GOOGLE_PLAY
    ) {
      throw new BadRequestException('Order is not a Google Play order.');
    }

    if (
      order.providerSnapshot.productType !==
      StoreProviderProductType.SUBSCRIPTION
    ) {
      throw new BadRequestException('Order is not a subscription product.');
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

  private selectLineItem(
    purchase: GooglePlaySubscriptionPurchaseV2,
    expectedProductId: string,
  ): GooglePlaySubscriptionLineItem {
    const matches = (purchase.lineItems ?? []).filter(
      (item) => item.productId === expectedProductId,
    );

    if (matches.length !== 1) {
      throw new BadRequestException(
        'Google Play subscription does not contain exactly one matching product.',
      );
    }

    return matches[0];
  }

  private projectState(params: {
    rawState: GooglePlaySubscriptionState;

    notificationType: GooglePlaySubscriptionNotificationType;

    expiresAt: Date;

    purchase: GooglePlaySubscriptionPurchaseV2;

    eventTime: Date;
  }): SubscriptionStateProjection {
    const now = new Date();

    const canceledAt = this.extractCancellationTime(params.purchase);

    const cancellationReason = this.extractCancellationReason(params.purchase);

    if (
      params.notificationType === GooglePlaySubscriptionNotificationType.REVOKED
    ) {
      return {
        status: StoreSubscriptionStatus.REVOKED,

        entitlementStatus: StoreSubscriptionEntitlementStatus.ENDED,

        entitlementActive: false,

        canceledAt,

        revokedAt: params.eventTime,

        expiredAt: null,

        cancellationReason,
      };
    }

    switch (params.rawState) {
      case 'SUBSCRIPTION_STATE_ACTIVE':
        return this.activeProjection(
          StoreSubscriptionStatus.ACTIVE,
          canceledAt,
          cancellationReason,
        );

      case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
        return this.activeProjection(
          StoreSubscriptionStatus.IN_GRACE_PERIOD,
          canceledAt,
          cancellationReason,
        );

      case 'SUBSCRIPTION_STATE_CANCELED': {
        const active = params.expiresAt.getTime() > now.getTime();

        return {
          status: StoreSubscriptionStatus.CANCELED,

          entitlementStatus: active
            ? StoreSubscriptionEntitlementStatus.ACTIVE
            : StoreSubscriptionEntitlementStatus.ENDED,

          entitlementActive: active,

          canceledAt: canceledAt ?? params.eventTime,

          revokedAt: null,

          expiredAt: active ? null : params.expiresAt,

          cancellationReason,
        };
      }

      case 'SUBSCRIPTION_STATE_ON_HOLD':
        return {
          status: StoreSubscriptionStatus.ON_HOLD,

          entitlementStatus: StoreSubscriptionEntitlementStatus.SUSPENDED,

          entitlementActive: false,

          canceledAt,
          revokedAt: null,
          expiredAt: null,
          cancellationReason,
        };

      case 'SUBSCRIPTION_STATE_PAUSED':
        return {
          status: StoreSubscriptionStatus.PAUSED,

          entitlementStatus: StoreSubscriptionEntitlementStatus.SUSPENDED,

          entitlementActive: false,

          canceledAt,
          revokedAt: null,
          expiredAt: null,
          cancellationReason,
        };

      case 'SUBSCRIPTION_STATE_EXPIRED':
        return {
          status: StoreSubscriptionStatus.EXPIRED,

          entitlementStatus: StoreSubscriptionEntitlementStatus.ENDED,

          entitlementActive: false,

          canceledAt,
          revokedAt: null,

          expiredAt: params.expiresAt,

          cancellationReason,
        };

      case 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED':
        return {
          status: StoreSubscriptionStatus.PENDING_PURCHASE_CANCELED,

          entitlementStatus: StoreSubscriptionEntitlementStatus.ENDED,

          entitlementActive: false,

          canceledAt: params.eventTime,

          revokedAt: null,
          expiredAt: null,
          cancellationReason,
        };

      case 'SUBSCRIPTION_STATE_PENDING':
        return {
          status: StoreSubscriptionStatus.PENDING,

          entitlementStatus: StoreSubscriptionEntitlementStatus.SUSPENDED,

          entitlementActive: false,

          canceledAt,
          revokedAt: null,
          expiredAt: null,
          cancellationReason,
        };

      default:
        return {
          status: StoreSubscriptionStatus.UNKNOWN,

          entitlementStatus: StoreSubscriptionEntitlementStatus.SUSPENDED,

          entitlementActive: false,

          canceledAt,
          revokedAt: null,
          expiredAt: null,
          cancellationReason,
        };
    }
  }

  private activeProjection(
    status: StoreSubscriptionStatus,
    canceledAt: Date | null,
    cancellationReason: string | null,
  ): SubscriptionStateProjection {
    return {
      status,

      entitlementStatus: StoreSubscriptionEntitlementStatus.ACTIVE,

      entitlementActive: true,

      canceledAt,

      revokedAt: null,
      expiredAt: null,
      cancellationReason,
    };
  }

  private async upsertRenewal(params: {
    manager: EntityManager;

    subscription: StoreSubscription;

    lineItem: GooglePlaySubscriptionLineItem;

    purchase: GooglePlaySubscriptionPurchaseV2;

    notificationType: GooglePlaySubscriptionNotificationType;

    rtdnEventId: string | null;
  }): Promise<boolean> {
    const providerOrderId =
      params.lineItem.latestSuccessfulOrderId ??
      params.purchase.latestOrderId ??
      null;

    if (!providerOrderId || !params.subscription.expiresAt) {
      return false;
    }

    const repository = params.manager.getRepository(StoreSubscriptionRenewal);

    let renewal = await repository.findOne({
      where: {
        provider: StorePaymentProvider.GOOGLE_PLAY,
        providerOrderId,
      },
      lock: {
        mode: 'pessimistic_write',
      },
    });

    const wasNew = !renewal;

    const previousRenewal = await repository
      .createQueryBuilder('renewal')
      .where('renewal.subscriptionId = :subscriptionId', {
        subscriptionId: params.subscription.id,
      })
      .andWhere('renewal.providerOrderId != :providerOrderId', {
        providerOrderId,
      })
      .orderBy('renewal.periodEnd', 'DESC')
      .getOne();

    const recurringPrice = params.lineItem.autoRenewingPlan?.recurringPrice;

    if (!renewal) {
      renewal = repository.create({
        subscriptionId: params.subscription.id,

        provider: StorePaymentProvider.GOOGLE_PLAY,

        providerOrderId,

        productId: params.subscription.productId,

        basePlanId: params.subscription.basePlanId,

        offerId: params.subscription.offerId,

        eventType: this.mapRenewalEventType(params.notificationType),

        status: StoreSubscriptionRenewalStatus.ACTIVE,

        periodStart:
          previousRenewal?.periodEnd ?? params.subscription.startedAt,

        periodEnd: params.subscription.expiresAt,

        priceCurrency: recurringPrice?.currencyCode ?? null,

        priceUnits: recurringPrice?.units ?? null,

        priceNanos: recurringPrice?.nanos ?? null,

        notificationType: params.notificationType,

        rtdnEventId: params.rtdnEventId,

        rawSubscriptionState: params.subscription.rawSubscriptionState,

        isTestPurchase: params.subscription.isTestPurchase,
      });
    } else {
      renewal.subscriptionId = params.subscription.id;

      renewal.productId = params.subscription.productId;

      renewal.basePlanId = params.subscription.basePlanId;

      renewal.offerId = params.subscription.offerId;

      renewal.eventType = this.mapRenewalEventType(params.notificationType);

      renewal.periodEnd = params.subscription.expiresAt;

      renewal.priceCurrency = recurringPrice?.currencyCode ?? null;

      renewal.priceUnits = recurringPrice?.units ?? null;

      renewal.priceNanos = recurringPrice?.nanos ?? null;

      renewal.notificationType = params.notificationType;

      renewal.rtdnEventId = params.rtdnEventId;

      renewal.rawSubscriptionState = params.subscription.rawSubscriptionState;

      renewal.isTestPurchase = params.subscription.isTestPurchase;
    }

    await repository.save(renewal);

    return wasNew;
  }

  private mapRenewalEventType(
    type: GooglePlaySubscriptionNotificationType,
  ): StoreSubscriptionRenewalEventType {
    switch (type) {
      case GooglePlaySubscriptionNotificationType.PURCHASED:
        return StoreSubscriptionRenewalEventType.INITIAL_PURCHASE;

      case GooglePlaySubscriptionNotificationType.RENEWED:
        return StoreSubscriptionRenewalEventType.RENEWAL;

      case GooglePlaySubscriptionNotificationType.RECOVERED:
        return StoreSubscriptionRenewalEventType.RECOVERY;

      case GooglePlaySubscriptionNotificationType.RESTARTED:
        return StoreSubscriptionRenewalEventType.RESTART;

      case GooglePlaySubscriptionNotificationType.DEFERRED:
        return StoreSubscriptionRenewalEventType.DEFERRED;

      case GooglePlaySubscriptionNotificationType.ITEMS_CHANGED:
        return StoreSubscriptionRenewalEventType.ITEMS_CHANGED;

      default:
        return StoreSubscriptionRenewalEventType.MANUAL_SYNC;
    }
  }

  private async recomputeUnlimitedStreakProtection(
    userId: string,
    manager: EntityManager,
  ): Promise<Date | null> {
    const result = await manager
      .getRepository(StoreSubscription)
      .createQueryBuilder('subscription')
      .select('MAX(subscription.expiresAt)', 'maxExpiry')
      .where('subscription.userId = :userId', { userId })
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

  private async isInitialProviderOrder(
    manager: EntityManager,
    subscription: StoreSubscription,
    providerOrderId: string,
  ): Promise<boolean> {
    const transaction = await manager
      .getRepository(StoreOrderProviderTransaction)
      .findOne({
        where: {
          orderId: subscription.initialOrderId,
        },
      });

    return transaction?.providerTransactionId === providerOrderId;
  }

  private sanitizePurchase(
    purchase: GooglePlaySubscriptionPurchaseV2,
  ): Record<string, unknown> {
    return {
      kind: purchase.kind ?? null,

      regionCode: purchase.regionCode ?? null,

      startTime: purchase.startTime ?? null,

      subscriptionState: purchase.subscriptionState ?? null,

      latestOrderId: purchase.latestOrderId ?? null,

      acknowledgementState: purchase.acknowledgementState ?? null,

      testPurchase: Boolean(purchase.testPurchase),

      lineItems: (purchase.lineItems ?? []).map((item) => ({
        productId: item.productId ?? null,

        expiryTime: item.expiryTime ?? null,

        latestSuccessfulOrderId: item.latestSuccessfulOrderId ?? null,

        autoRenewEnabled: item.autoRenewingPlan?.autoRenewEnabled ?? false,

        recurringPrice: item.autoRenewingPlan?.recurringPrice ?? null,

        basePlanId: item.offerDetails?.basePlanId ?? null,

        offerId: item.offerDetails?.offerId ?? null,
      })),

      pausedAutoResumeTime: purchase.pausedStateContext?.autoResumeTime ?? null,

      cancellationReason: this.extractCancellationReason(purchase),

      cancellationTime:
        this.extractCancellationTime(purchase)?.toISOString() ?? null,
    };
  }

  private extractCancellationTime(
    purchase: GooglePlaySubscriptionPurchaseV2,
  ): Date | null {
    return this.parseOptionalDate(
      purchase.canceledStateContext?.userInitiatedCancellation?.cancelTime,
    );
  }

  private extractCancellationReason(
    purchase: GooglePlaySubscriptionPurchaseV2,
  ): string | null {
    const context = purchase.canceledStateContext;

    if (context?.userInitiatedCancellation) {
      return (
        context.userInitiatedCancellation.cancelSurveyResult?.reasonUserInput ??
        context.userInitiatedCancellation.cancelSurveyResult?.reason ??
        'user_initiated'
      );
    }

    if (context?.developerInitiatedCancellation) {
      return 'developer_initiated';
    }

    if (context?.systemInitiatedCancellation) {
      return 'system_initiated';
    }

    if (context?.replacementCancellation) {
      return 'replacement';
    }

    return null;
  }

  private parseRequiredDate(
    value: string | undefined,
    fieldName: string,
  ): Date {
    const parsed = this.parseOptionalDate(value);

    if (!parsed) {
      throw new BadRequestException(`${fieldName} is missing or invalid.`);
    }

    return parsed;
  }

  private parseOptionalDate(value: string | undefined): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private mapSubscription(
    subscription: StoreSubscription,
  ): StoreSubscriptionResponse {
    return {
      id: subscription.id,
      userId: subscription.userId,
      packageId: subscription.packageId,
      initialOrderId: subscription.initialOrderId,
      provider: subscription.provider,
      productId: subscription.productId,
      basePlanId: subscription.basePlanId,
      offerId: subscription.offerId,
      latestOrderId: subscription.latestOrderId,
      status: subscription.status,
      rawSubscriptionState: subscription.rawSubscriptionState,
      entitlementStatus: subscription.entitlementStatus,
      entitlementActive: subscription.entitlementActive,
      autoRenewEnabled: subscription.autoRenewEnabled,
      startedAt: subscription.startedAt,
      expiresAt: subscription.expiresAt,
      pausedResumeAt: subscription.pausedResumeAt,
      canceledAt: subscription.canceledAt,
      revokedAt: subscription.revokedAt,
      expiredAt: subscription.expiredAt,
      environment: subscription.environment,
      isTestPurchase: subscription.isTestPurchase,
      regionCode: subscription.regionCode,
      cancellationReason: subscription.cancellationReason,
      lastNotificationType: subscription.lastNotificationType,
      lastRtdnEventId: subscription.lastRtdnEventId,
      lastEventTime: subscription.lastEventTime,
      lastSyncedAt: subscription.lastSyncedAt,
      cancelRequestedAt: subscription.cancelRequestedAt,
      cancelRequestedByAdminId: subscription.cancelRequestedByAdminId,
      cancelRequestType: subscription.cancelRequestType,
      latestPayload: subscription.latestPayload,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }
}
