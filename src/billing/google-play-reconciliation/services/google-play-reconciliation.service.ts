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
import { randomUUID } from 'node:crypto';
import {
  Brackets,
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';

import type { GooglePlayVoidedPurchase } from 'src/billing/types/google-play-billing.type';
import { GooglePlayBillingService } from 'src/billing/google-play/google-play-billing.service';

import { GooglePlayRtdnCipherService } from 'src/billing/google-play-rtdn/services/google-play-rtdn-cipher.service';
import { GooglePlayRtdnProcessorService } from 'src/billing/google-play-rtdn/services/google-play-rtdn-processor.service';

import { GooglePlaySubscriptionLifecycleService } from 'src/billing/google-play-subscriptions/services/google-play-subscription-lifecycle.service';

import { CourseOrderProviderTransaction } from 'src/module-2/course-commerce/entities/course-order-provider-transaction.entity';
import { AdminCourseCommerceService } from 'src/module-2/course-commerce/services/admin-course-commerce.service';
import { CoursePaymentProvider } from 'src/module-2/course-commerce/types/course-commerce.type';

import { StoreOrderProviderTransaction } from 'src/package-store/entities/store-order-provider-transaction.entity';
import { PackageStoreService } from 'src/package-store/services/package-store.service';
import { StorePaymentProvider } from 'src/package-store/types/package-store.type';

import { GooglePlayReconciliationCheckpoint } from '../entities/google-play-reconciliation-checkpoint.entity';
import { GooglePlayVoidedPurchaseRecord } from '../entities/google-play-voided-purchase-record.entity';
import {
  GooglePlayReconciliationJobKey,
  GooglePlayVoidedRecordDomain,
  GooglePlayVoidedRecordStatus,
  type GooglePlayVoidedReconciliationSummary,
} from 'src/billing/types/google-play-reconciliation.type';

type InternalPurchaseMatch =
  | {
      domain: GooglePlayVoidedRecordDomain.COURSE;
      transaction: CourseOrderProviderTransaction;
    }
  | {
      domain: GooglePlayVoidedRecordDomain.PACKAGE_STORE;
      transaction: StoreOrderProviderTransaction;
    };

type ProcessVoidedResult = {
  status: GooglePlayVoidedRecordStatus;

  domain: GooglePlayVoidedRecordDomain;

  internalOrderId: string | null;

  result: Record<string, unknown>;
};

@Injectable()
export class GooglePlayReconciliationService {
  private readonly logger = new Logger(GooglePlayReconciliationService.name);

  private readonly enabled: boolean;

  private readonly backfillDays: number;

  private readonly overlapMinutes: number;

  private readonly pageSize: number;

  private readonly maxPages: number;

  private readonly processBatchSize: number;

  private readonly maxAttempts: number;

  private readonly leaseMinutes: number;

  constructor(
    @InjectRepository(GooglePlayReconciliationCheckpoint)
    private readonly checkpointRepository: Repository<GooglePlayReconciliationCheckpoint>,

    @InjectRepository(GooglePlayVoidedPurchaseRecord)
    private readonly recordRepository: Repository<GooglePlayVoidedPurchaseRecord>,

    @InjectRepository(CourseOrderProviderTransaction)
    private readonly courseTransactionRepository: Repository<CourseOrderProviderTransaction>,

    @InjectRepository(StoreOrderProviderTransaction)
    private readonly storeTransactionRepository: Repository<StoreOrderProviderTransaction>,

    private readonly dataSource: DataSource,

    private readonly configService: ConfigService,

    private readonly googlePlayBillingService: GooglePlayBillingService,

    private readonly cipherService: GooglePlayRtdnCipherService,

    private readonly subscriptionLifecycleService: GooglePlaySubscriptionLifecycleService,

    private readonly adminCourseCommerceService: AdminCourseCommerceService,

    private readonly packageStoreService: PackageStoreService,

    private readonly rtdnProcessorService: GooglePlayRtdnProcessorService,
  ) {
    this.enabled =
      this.configService.get<string>(
        'GOOGLE_PLAY_VOIDED_RECONCILIATION_ENABLED',
      ) !== 'false';

    this.backfillDays = this.readPositiveInteger(
      'GOOGLE_PLAY_VOIDED_BACKFILL_DAYS',
      29,
    );

    this.overlapMinutes = this.readPositiveInteger(
      'GOOGLE_PLAY_VOIDED_OVERLAP_MINUTES',
      15,
    );

    this.pageSize = this.readPositiveInteger(
      'GOOGLE_PLAY_VOIDED_PAGE_SIZE',
      1000,
    );

    this.maxPages = this.readPositiveInteger(
      'GOOGLE_PLAY_VOIDED_MAX_PAGES',
      50,
    );

    this.processBatchSize = this.readPositiveInteger(
      'GOOGLE_PLAY_VOIDED_PROCESS_BATCH',
      100,
    );

    this.maxAttempts = this.readPositiveInteger(
      'GOOGLE_PLAY_VOIDED_MAX_ATTEMPTS',
      10,
    );

    this.leaseMinutes = this.readPositiveInteger(
      'GOOGLE_PLAY_VOIDED_LEASE_MINUTES',
      15,
    );
  }

  @Cron('0 5 * * * *', {
    name: 'google-play-voided-purchases-reconciliation',
  })
  async scheduledReconciliation(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const result = await this.runReconciliation({});

      if (!result.alreadyRunning) {
        this.logger.log(
          `Google Play reconciliation completed: ` +
            `${result.recordsInserted} inserted, ` +
            `${result.recordsProcessed} processed, ` +
            `${result.recordsUnmatched} unmatched, ` +
            `${result.recordsFailed} failed.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Google Play reconciliation failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  @Cron('30 * * * * *', {
    name: 'google-play-voided-record-processor',
  })
  async scheduledRecordProcessing(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      await this.processAvailableRecords(this.processBatchSize);
    } catch (error) {
      this.logger.error(
        `Voided-purchase record processing failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  async runReconciliation(params: {
    startTime?: Date;
    endTime?: Date;
    maxPages?: number;
    processLimit?: number;
  }): Promise<GooglePlayVoidedReconciliationSummary> {
    if (!this.googlePlayBillingService.isRealVerificationEnabled()) {
      throw new BadRequestException(
        'Real Google Play verification must be enabled.',
      );
    }

    const leaseOwner = randomUUID();

    const checkpoint = await this.acquireLease(leaseOwner);

    if (!checkpoint) {
      return {
        alreadyRunning: true,

        windowStart: null,
        windowEnd: null,

        pagesFetched: 0,
        recordsSeen: 0,
        recordsInserted: 0,
        recordsProcessed: 0,
        recordsUnmatched: 0,
        recordsFailed: 0,
      };
    }

    const endTime = params.endTime ?? new Date();

    const startTime =
      params.startTime ?? this.calculateStartTime(checkpoint, endTime);

    const maxPages = Math.min(
      100,
      Math.max(1, params.maxPages ?? this.maxPages),
    );

    const processLimit = Math.min(
      1000,
      Math.max(1, params.processLimit ?? this.processBatchSize),
    );

    try {
      this.validateWindow(startTime, endTime);

      let nextPageToken: string | null = null;

      let pagesFetched = 0;
      let recordsSeen = 0;
      let recordsInserted = 0;

      do {
        const response =
          await this.googlePlayBillingService.listVoidedPurchases({
            startTime,
            endTime,

            pageToken: nextPageToken,

            maxResults: this.pageSize,

            includeSubscriptions: true,

            includeQuantityBasedPartialRefund: true,
          });

        pagesFetched += 1;

        const purchases = response.voidedPurchases ?? [];

        recordsSeen += purchases.length;

        for (const purchase of purchases) {
          const inserted = await this.persistVoidedPurchase(purchase);

          if (inserted) {
            recordsInserted += 1;
          }
        }

        nextPageToken = response.tokenPagination?.nextPageToken?.trim() || null;

        if (nextPageToken && pagesFetched >= maxPages) {
          throw new ConflictException(
            'Voided-purchase reconciliation reached maxPages before exhausting Google pagination.',
          );
        }
      } while (nextPageToken);

      await this.markFetchSuccessful({
        leaseOwner,
        endTime,
        pagesFetched,
        recordsSeen,
        recordsInserted,
      });

      const processing = await this.processAvailableRecords(processLimit);

      const summary: GooglePlayVoidedReconciliationSummary = {
        alreadyRunning: false,

        windowStart: startTime,
        windowEnd: endTime,

        pagesFetched,
        recordsSeen,
        recordsInserted,

        recordsProcessed: processing.processed,

        recordsUnmatched: processing.unmatched,

        recordsFailed: processing.failed,
      };

      await this.releaseLeaseSuccessfully({
        leaseOwner,
        summary,
      });

      return summary;
    } catch (error) {
      await this.releaseLeaseWithFailure({
        leaseOwner,
        error,
      });

      throw error;
    }
  }

  async processAvailableRecords(limit: number): Promise<{
    processed: number;
    unmatched: number;
    failed: number;
  }> {
    let processed = 0;
    let unmatched = 0;
    let failed = 0;

    for (let index = 0; index < limit; index += 1) {
      const record = await this.claimNextRecord();

      if (!record) {
        break;
      }

      try {
        const result = await this.processRecord(record);

        /*
         * Use entity mutation + save instead of Repository.update().
         *
         * TypeORM's QueryDeepPartialEntity type does not correctly
         * accept a generic Record<string, unknown> for a JSONB field.
         */
        record.status = result.status;
        record.matchedDomain = result.domain;
        record.internalOrderId = result.internalOrderId;
        record.processingResult = result.result;

        record.processedAt =
          result.status === GooglePlayVoidedRecordStatus.PROCESSED
            ? new Date()
            : null;

        record.processingStartedAt = null;

        record.nextAttemptAt =
          result.status === GooglePlayVoidedRecordStatus.UNMATCHED
            ? this.nextUnmatchedAttempt(record.attemptCount)
            : null;

        record.lastErrorCode = null;
        record.lastErrorMessage = null;

        await this.recordRepository.save(record);

        if (result.status === GooglePlayVoidedRecordStatus.PROCESSED) {
          processed += 1;
        } else if (
          result.status === GooglePlayVoidedRecordStatus.UNMATCHED ||
          result.status === GooglePlayVoidedRecordStatus.DEAD_LETTER
        ) {
          unmatched += 1;
        }
      } catch (error) {
        failed += 1;

        await this.markRecordFailure(record, error);
      }
    }

    return {
      processed,
      unmatched,
      failed,
    };
  }

  async retryFailedRecords(params: {
    includeDeadLetter?: boolean;
    limit?: number;
  }) {
    const limit = Math.min(1000, Math.max(1, params.limit ?? 100));

    const statuses = [
      GooglePlayVoidedRecordStatus.FAILED,
      GooglePlayVoidedRecordStatus.UNMATCHED,
    ];

    if (params.includeDeadLetter) {
      statuses.push(GooglePlayVoidedRecordStatus.DEAD_LETTER);
    }

    const records = await this.recordRepository
      .createQueryBuilder('record')
      .select('record.id', 'id')
      .where('record.status IN (:...statuses)', {
        statuses,
      })
      .orderBy('record.updatedAt', 'ASC')
      .limit(limit)
      .getRawMany<{
        id: string;
      }>();

    const ids = records.map((record) => record.id);

    if (ids.length === 0) {
      return {
        queued: 0,
      };
    }

    await this.recordRepository
      .createQueryBuilder()
      .update(GooglePlayVoidedPurchaseRecord)
      .set({
        status: GooglePlayVoidedRecordStatus.PENDING,

        attemptCount: 0,

        nextAttemptAt: new Date(),

        processingStartedAt: null,

        lastErrorCode: null,
        lastErrorMessage: null,
      })
      .whereInIds(ids)
      .execute();

    const processing = await this.processAvailableRecords(ids.length);

    return {
      queued: ids.length,
      ...processing,
    };
  }

  async retryRecord(recordId: string) {
    const record = await this.recordRepository.findOne({
      where: {
        id: recordId,
      },
    });

    if (!record) {
      throw new NotFoundException(
        'Voided-purchase reconciliation record not found.',
      );
    }

    if (record.status === GooglePlayVoidedRecordStatus.PROCESSED) {
      throw new ConflictException(
        'This voided-purchase record was already processed.',
      );
    }

    await this.recordRepository.update(
      {
        id: record.id,
      },
      {
        status: GooglePlayVoidedRecordStatus.PENDING,

        attemptCount: 0,

        nextAttemptAt: new Date(),

        processingStartedAt: null,

        lastErrorCode: null,
        lastErrorMessage: null,
      },
    );

    await this.processAvailableRecords(1);

    return this.recordRepository.findOne({
      where: {
        id: record.id,
      },
    });
  }

  async getStatus() {
    const checkpoint = await this.checkpointRepository.findOne({
      where: {
        key: GooglePlayReconciliationJobKey.VOIDED_PURCHASES,
      },
    });

    const recordCounts = await this.recordRepository
      .createQueryBuilder('record')
      .select('record.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('record.status')
      .getRawMany<{
        status: GooglePlayVoidedRecordStatus;

        count: string;
      }>();

    const rtdnStatus = await this.rtdnProcessorService.getProcessingSummary();

    return {
      checkpoint,

      voidedPurchases: Object.fromEntries(
        recordCounts.map((item) => [item.status, Number(item.count)]),
      ),

      rtdn: rtdnStatus,
    };
  }

  private async persistVoidedPurchase(
    purchase: GooglePlayVoidedPurchase,
  ): Promise<boolean> {
    const providerOrderId = purchase.orderId?.trim();

    const purchaseToken = purchase.purchaseToken?.trim();

    const voidedTime = this.parseMillisDate(
      purchase.voidedTimeMillis,
      'voidedTimeMillis',
    );

    if (!providerOrderId) {
      throw new BadRequestException(
        'Google Play voided purchase is missing orderId.',
      );
    }

    if (!purchaseToken) {
      throw new BadRequestException(
        'Google Play voided purchase is missing purchaseToken.',
      );
    }

    const purchaseTokenHash =
      this.googlePlayBillingService.hashPurchaseToken(purchaseToken);

    const fingerprint = this.createFingerprint({
      providerOrderId,
      purchaseTokenHash,

      voidedTimeMillis: purchase.voidedTimeMillis ?? '',

      voidedReason: purchase.voidedReason ?? null,

      voidedSource: purchase.voidedSource ?? null,

      voidedQuantity: purchase.voidedQuantity ?? null,
    });

    const encrypted = this.cipherService.encryptJson(purchase);

    const record = this.recordRepository.create({
      fingerprint,

      providerOrderId,

      purchaseTokenHash,

      purchaseTime: this.parseOptionalMillisDate(purchase.purchaseTimeMillis),

      voidedTime,

      voidedReason: purchase.voidedReason ?? null,

      voidedSource: purchase.voidedSource ?? null,

      voidedQuantity: purchase.voidedQuantity ?? null,

      payloadCiphertext: encrypted.ciphertext,

      payloadIv: encrypted.iv,

      payloadAuthTag: encrypted.authTag,

      matchedDomain: GooglePlayVoidedRecordDomain.UNKNOWN,

      internalOrderId: null,

      status: GooglePlayVoidedRecordStatus.PENDING,

      attemptCount: 0,

      processingResult: null,

      lastErrorCode: null,

      lastErrorMessage: null,

      nextAttemptAt: new Date(),

      processingStartedAt: null,

      processedAt: null,
    });

    try {
      await this.recordRepository.save(record);

      return true;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return false;
      }

      throw error;
    }
  }

  private async processRecord(
    record: GooglePlayVoidedPurchaseRecord,
  ): Promise<ProcessVoidedResult> {
    const purchase = this.cipherService.decryptJson<GooglePlayVoidedPurchase>({
      ciphertext: record.payloadCiphertext,

      iv: record.payloadIv,

      authTag: record.payloadAuthTag,
    });

    const purchaseToken = purchase.purchaseToken?.trim();

    const providerOrderId = purchase.orderId?.trim();

    if (!purchaseToken || !providerOrderId) {
      throw new BadRequestException(
        'Stored voided-purchase payload is incomplete.',
      );
    }

    /*
     * Check subscriptions first because subscription renewal
     * order IDs can also match package-store transactions.
     */
    const subscriptionResult =
      await this.subscriptionLifecycleService.applyVoidedPurchase({
        purchaseToken,

        providerOrderId,

        eventTime: record.voidedTime,

        rtdnEventId: null,
      });

    if (subscriptionResult.matched) {
      return {
        status: GooglePlayVoidedRecordStatus.PROCESSED,

        domain: GooglePlayVoidedRecordDomain.SUBSCRIPTION,

        internalOrderId: subscriptionResult.initialOrderId,

        result: {
          action: 'subscription_void_reconciled',

          providerOrderId,

          isInitialOrder: subscriptionResult.isInitialOrder,

          entitlementRevoked: subscriptionResult.entitlementRevoked,

          voidedReason: purchase.voidedReason ?? null,

          voidedSource: purchase.voidedSource ?? null,

          voidedQuantity: purchase.voidedQuantity ?? null,

          subscription: subscriptionResult.subscription,
        },
      };
    }

    const internalPurchase = await this.findInternalPurchase({
      purchaseTokenHash: record.purchaseTokenHash,

      providerOrderId,
    });

    if (!internalPurchase) {
      return {
        status:
          record.attemptCount >= this.maxAttempts
            ? GooglePlayVoidedRecordStatus.DEAD_LETTER
            : GooglePlayVoidedRecordStatus.UNMATCHED,

        domain: GooglePlayVoidedRecordDomain.UNKNOWN,

        internalOrderId: null,

        result: {
          action: 'voided_purchase_unmatched',

          providerOrderId,

          voidedReason: purchase.voidedReason ?? null,

          voidedSource: purchase.voidedSource ?? null,

          voidedQuantity: purchase.voidedQuantity ?? null,
        },
      };
    }

    if (internalPurchase.domain === GooglePlayVoidedRecordDomain.COURSE) {
      await this.adminCourseCommerceService.applyGooglePlayVoidedPurchase({
        internalOrderId: internalPurchase.transaction.orderId,

        providerOrderId,

        purchaseTokenHash: record.purchaseTokenHash,

        eventTime: record.voidedTime,
      });

      return {
        status: GooglePlayVoidedRecordStatus.PROCESSED,

        domain: GooglePlayVoidedRecordDomain.COURSE,

        internalOrderId: internalPurchase.transaction.orderId,

        result: {
          action: 'course_void_reconciled',

          providerOrderId,

          voidedReason: purchase.voidedReason ?? null,

          voidedSource: purchase.voidedSource ?? null,

          voidedQuantity: purchase.voidedQuantity ?? null,
        },
      };
    }

    await this.packageStoreService.applyGooglePlayVoidedPurchase({
      internalOrderId: internalPurchase.transaction.orderId,

      providerOrderId,

      purchaseTokenHash: record.purchaseTokenHash,

      eventTime: record.voidedTime,
    });

    return {
      status: GooglePlayVoidedRecordStatus.PROCESSED,

      domain: GooglePlayVoidedRecordDomain.PACKAGE_STORE,

      internalOrderId: internalPurchase.transaction.orderId,

      result: {
        action: 'package_void_reconciled',

        providerOrderId,

        voidedReason: purchase.voidedReason ?? null,

        voidedSource: purchase.voidedSource ?? null,

        voidedQuantity: purchase.voidedQuantity ?? null,
      },
    };
  }

  private async findInternalPurchase(params: {
    purchaseTokenHash: string;
    providerOrderId: string;
  }): Promise<InternalPurchaseMatch | null> {
    const courseTransactions = await this.courseTransactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.provider = :provider', {
        provider: CoursePaymentProvider.GOOGLE_PLAY,
      })
      .andWhere(
        new Brackets((where) => {
          where
            .where('transaction.tokenHash = :tokenHash', {
              tokenHash: params.purchaseTokenHash,
            })
            .orWhere('transaction.providerTransactionId = :providerOrderId', {
              providerOrderId: params.providerOrderId,
            });
        }),
      )
      .getMany();

    const storeTransactions = await this.storeTransactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.provider = :provider', {
        provider: StorePaymentProvider.GOOGLE_PLAY,
      })
      .andWhere(
        new Brackets((where) => {
          where
            .where('transaction.tokenHash = :tokenHash', {
              tokenHash: params.purchaseTokenHash,
            })
            .orWhere('transaction.providerTransactionId = :providerOrderId', {
              providerOrderId: params.providerOrderId,
            });
        }),
      )
      .getMany();

    const total = courseTransactions.length + storeTransactions.length;

    if (total === 0) {
      return null;
    }

    if (total > 1) {
      throw new ConflictException(
        'Voided purchase matched more than one internal transaction.',
      );
    }

    if (courseTransactions.length === 1) {
      return {
        domain: GooglePlayVoidedRecordDomain.COURSE,

        transaction: courseTransactions[0],
      };
    }

    return {
      domain: GooglePlayVoidedRecordDomain.PACKAGE_STORE,

      transaction: storeTransactions[0],
    };
  }

  private async claimNextRecord(): Promise<GooglePlayVoidedPurchaseRecord | null> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(GooglePlayVoidedPurchaseRecord);

      const now = new Date();

      const staleBefore = new Date(now.getTime() - 15 * 60 * 1000);

      const record = await repository
        .createQueryBuilder('record')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where(
          new Brackets((where) => {
            where
              .where('record.status = :pending', {
                pending: GooglePlayVoidedRecordStatus.PENDING,
              })
              .orWhere(
                `(
                      record.status IN (:...retryStatuses)
                      AND record.nextAttemptAt <= :now
                    )`,
                {
                  retryStatuses: [
                    GooglePlayVoidedRecordStatus.FAILED,

                    GooglePlayVoidedRecordStatus.UNMATCHED,
                  ],

                  now,
                },
              )
              .orWhere(
                `(
                      record.status = :processing
                      AND record.processingStartedAt <= :staleBefore
                    )`,
                {
                  processing: GooglePlayVoidedRecordStatus.PROCESSING,

                  staleBefore,
                },
              );
          }),
        )
        .andWhere('record.attemptCount < :maxAttempts', {
          maxAttempts: this.maxAttempts,
        })
        .orderBy('record.discoveredAt', 'ASC')
        .take(1)
        .getOne();

      if (!record) {
        return null;
      }

      record.status = GooglePlayVoidedRecordStatus.PROCESSING;

      record.attemptCount += 1;

      record.processingStartedAt = now;

      record.nextAttemptAt = null;

      record.lastErrorCode = null;

      record.lastErrorMessage = null;

      return repository.save(record);
    });
  }

  private async markRecordFailure(
    record: GooglePlayVoidedPurchaseRecord,
    error: unknown,
  ): Promise<void> {
    const normalized = this.normalizeError(error);

    const deadLetter = record.attemptCount >= this.maxAttempts;

    await this.recordRepository.update(
      {
        id: record.id,
      },
      {
        status: deadLetter
          ? GooglePlayVoidedRecordStatus.DEAD_LETTER
          : GooglePlayVoidedRecordStatus.FAILED,

        lastErrorCode: normalized.code,

        lastErrorMessage: normalized.message,

        processingStartedAt: null,

        nextAttemptAt: deadLetter
          ? null
          : new Date(
              Date.now() + this.calculateRetryDelayMs(record.attemptCount),
            ),
      },
    );
  }

  private async acquireLease(
    leaseOwner: string,
  ): Promise<GooglePlayReconciliationCheckpoint | null> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(
        GooglePlayReconciliationCheckpoint,
      );

      let checkpoint = await repository.findOne({
        where: {
          key: GooglePlayReconciliationJobKey.VOIDED_PURCHASES,
        },

        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!checkpoint) {
        try {
          checkpoint = await repository.save(
            repository.create({
              key: GooglePlayReconciliationJobKey.VOIDED_PURCHASES,

              lastSuccessfulEndTime: null,

              lastStartedAt: null,
              lastCompletedAt: null,
              lastFailedAt: null,

              leaseOwner: null,
              leaseExpiresAt: null,

              lastErrorMessage: null,

              lastResult: null,
            }),
          );
        } catch (error) {
          if (!this.isUniqueViolation(error)) {
            throw error;
          }

          checkpoint = await repository.findOne({
            where: {
              key: GooglePlayReconciliationJobKey.VOIDED_PURCHASES,
            },

            lock: {
              mode: 'pessimistic_write',
            },
          });
        }
      }

      if (!checkpoint) {
        throw new ConflictException(
          'Unable to create the reconciliation checkpoint.',
        );
      }

      const now = new Date();

      if (
        checkpoint.leaseOwner &&
        checkpoint.leaseExpiresAt &&
        checkpoint.leaseExpiresAt > now
      ) {
        return null;
      }

      checkpoint.leaseOwner = leaseOwner;

      checkpoint.leaseExpiresAt = new Date(
        now.getTime() + this.leaseMinutes * 60 * 1000,
      );

      checkpoint.lastStartedAt = now;

      checkpoint.lastErrorMessage = null;

      return repository.save(checkpoint);
    });
  }

  private async markFetchSuccessful(params: {
    leaseOwner: string;
    endTime: Date;
    pagesFetched: number;
    recordsSeen: number;
    recordsInserted: number;
  }): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(
        GooglePlayReconciliationCheckpoint,
      );

      const checkpoint = await repository.findOne({
        where: {
          key: GooglePlayReconciliationJobKey.VOIDED_PURCHASES,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!checkpoint || checkpoint.leaseOwner !== params.leaseOwner) {
        return;
      }

      checkpoint.lastSuccessfulEndTime = params.endTime;

      checkpoint.lastResult = {
        pagesFetched: params.pagesFetched,
        recordsSeen: params.recordsSeen,
        recordsInserted: params.recordsInserted,
        fetchCompletedAt: new Date().toISOString(),
      };

      await repository.save(checkpoint);
    });
  }

  private async releaseLeaseSuccessfully(params: {
    leaseOwner: string;
    summary: GooglePlayVoidedReconciliationSummary;
  }): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(
        GooglePlayReconciliationCheckpoint,
      );

      const checkpoint = await repository.findOne({
        where: {
          key: GooglePlayReconciliationJobKey.VOIDED_PURCHASES,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!checkpoint || checkpoint.leaseOwner !== params.leaseOwner) {
        return;
      }

      checkpoint.leaseOwner = null;
      checkpoint.leaseExpiresAt = null;
      checkpoint.lastCompletedAt = new Date();
      checkpoint.lastErrorMessage = null;

      checkpoint.lastResult = {
        alreadyRunning: params.summary.alreadyRunning,

        windowStart: params.summary.windowStart?.toISOString() ?? null,

        windowEnd: params.summary.windowEnd?.toISOString() ?? null,

        pagesFetched: params.summary.pagesFetched,
        recordsSeen: params.summary.recordsSeen,
        recordsInserted: params.summary.recordsInserted,
        recordsProcessed: params.summary.recordsProcessed,
        recordsUnmatched: params.summary.recordsUnmatched,
        recordsFailed: params.summary.recordsFailed,
      };

      await repository.save(checkpoint);
    });
  }

  private async releaseLeaseWithFailure(params: {
    leaseOwner: string;
    error: unknown;
  }): Promise<void> {
    const normalized = this.normalizeError(params.error);

    await this.checkpointRepository
      .createQueryBuilder()
      .update(GooglePlayReconciliationCheckpoint)
      .set({
        leaseOwner: null,

        leaseExpiresAt: null,

        lastFailedAt: new Date(),

        lastErrorMessage: normalized.message,
      })
      .where('"key" = :key', {
        key: GooglePlayReconciliationJobKey.VOIDED_PURCHASES,
      })
      .andWhere('"leaseOwner" = :leaseOwner', {
        leaseOwner: params.leaseOwner,
      })
      .execute();
  }

  private calculateStartTime(
    checkpoint: GooglePlayReconciliationCheckpoint,
    endTime: Date,
  ): Date {
    const oldestAllowed = new Date(
      endTime.getTime() - 29 * 24 * 60 * 60 * 1000,
    );

    if (!checkpoint.lastSuccessfulEndTime) {
      return oldestAllowed;
    }

    const overlapped = new Date(
      checkpoint.lastSuccessfulEndTime.getTime() -
        this.overlapMinutes * 60 * 1000,
    );

    return overlapped < oldestAllowed ? oldestAllowed : overlapped;
  }

  private validateWindow(startTime: Date, endTime: Date): void {
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new BadRequestException('Reconciliation window is invalid.');
    }

    if (startTime.getTime() >= endTime.getTime()) {
      throw new BadRequestException(
        'Reconciliation start time must be before end time.',
      );
    }

    if (endTime.getTime() > Date.now() + 60_000) {
      throw new BadRequestException(
        'Reconciliation end time cannot be in the future.',
      );
    }

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    if (startTime.getTime() < thirtyDaysAgo) {
      throw new BadRequestException(
        'Google Play reconciliation cannot start more than 30 days ago.',
      );
    }
  }

  private createFingerprint(value: {
    providerOrderId: string;
    purchaseTokenHash: string;
    voidedTimeMillis: string;
    voidedReason: number | null;
    voidedSource: number | null;
    voidedQuantity: number | null;
  }): string {
    return this.googlePlayBillingService.hashPurchaseToken(
      [
        value.providerOrderId,
        value.purchaseTokenHash,
        value.voidedTimeMillis,
        value.voidedReason ?? '',
        value.voidedSource ?? '',
        value.voidedQuantity ?? '',
      ].join('|'),
    );
  }

  private parseMillisDate(value: string | undefined, fieldName: string): Date {
    const parsed = this.parseOptionalMillisDate(value);

    if (!parsed) {
      throw new BadRequestException(
        `Google Play ${fieldName} is missing or invalid.`,
      );
    }

    return parsed;
  }

  private parseOptionalMillisDate(value: string | undefined): Date | null {
    if (!value) {
      return null;
    }

    const milliseconds = Number(value);

    if (!Number.isFinite(milliseconds)) {
      return null;
    }

    const date = new Date(milliseconds);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private nextUnmatchedAttempt(attemptCount: number): Date | null {
    if (attemptCount >= this.maxAttempts) {
      return null;
    }

    return new Date(Date.now() + 6 * 60 * 60 * 1000);
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
      code: 'UNKNOWN_RECONCILIATION_ERROR',

      message: 'Unknown reconciliation error.',
    };
  }

  private readPositiveInteger(key: string, fallback: number): number {
    const parsed = Number(this.configService.get<string>(key));

    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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
