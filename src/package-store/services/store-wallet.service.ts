import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { UserStreak } from 'src/module-2/scoring/entities/user-streak.entity';
import { CvEconomyConfig } from '../entities/cv-economy-config.entity';
import { StoreOrder } from '../entities/store-order.entity';
import { UserStoreWallet } from '../entities/user-store-wallet.entity';
import {
  StorePackageType,
  StreakProtectionMode,
} from '../types/package-store.type';
import { PaymentRequiredException } from 'src/common/exceptions/payment-required.exception';
import { StoreOrderReversal } from '../entities/store-order-reversal.entity';

@Injectable()
export class StoreWalletService {
  constructor(
    @InjectRepository(CvEconomyConfig)
    private readonly configRepository: Repository<CvEconomyConfig>,

    private readonly dataSource: DataSource,
  ) {}

  async initializeForNewUser(userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const wallet = await this.getOrCreateWallet(userId, manager, true);

      return this.mapBalances(userId, wallet, manager);
    });
  }

  async getBalances(userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const wallet = await this.getOrCreateWallet(userId, manager, true);

      return this.mapBalances(userId, wallet, manager);
    });
  }

  async grantLeaderboardReward(params: {
    userId: string;
    aiVoiceMinutes?: number;
    aiTextTokens?: number;
    cvCredits?: number;
    streakFreezes?: number;
  }) {
    const amounts = [
      params.aiVoiceMinutes ?? 0,
      params.aiTextTokens ?? 0,
      params.cvCredits ?? 0,
      params.streakFreezes ?? 0,
    ];

    if (amounts.some((amount) => !Number.isInteger(amount) || amount < 0)) {
      throw new BadRequestException(
        'Leaderboard reward balances must use non-negative integers.',
      );
    }

    if (amounts.every((amount) => amount === 0)) {
      throw new BadRequestException(
        'The leaderboard reward amount is invalid.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const wallet = await this.getOrCreateWallet(params.userId, manager, true);
      const streak = await this.getOrCreateStreak(params.userId, manager);

      wallet.aiVoiceMinutes += params.aiVoiceMinutes ?? 0;
      wallet.aiTextTokens += params.aiTextTokens ?? 0;
      wallet.cvCredits += params.cvCredits ?? 0;
      streak.streakFreezeCount += params.streakFreezes ?? 0;

      await manager.getRepository(UserStoreWallet).save(wallet);
      await manager.getRepository(UserStreak).save(streak);

      return this.mapBalances(params.userId, wallet, manager);
    });
  }

  /**
   * Call this only when the user performs a final
   * CV generation/download.
   *
   * Editing an existing CV should not call this method.
   */
  async consumeCvCredit(
    userId: string,
    manager?: EntityManager,
  ): Promise<{
    remainingCredits: number;
  }> {
    if (manager) {
      return this.consumeCvCreditWithManager(userId, manager);
    }

    return this.dataSource.transaction((transactionManager) =>
      this.consumeCvCreditWithManager(userId, transactionManager),
    );
  }

  /**
   * Internal backend method for the AI speaking/chat service.
   * Do not expose this as a public controller endpoint.
   */
  async consumeAiResources(params: {
    userId: string;
    voiceMinutes: number;
    textTokens: number;
  }) {
    if (
      !Number.isInteger(params.voiceMinutes) ||
      params.voiceMinutes < 0 ||
      !Number.isInteger(params.textTokens) ||
      params.textTokens < 0
    ) {
      throw new BadRequestException(
        'AI resource usage must use non-negative integers.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const wallet = await this.getOrCreateWallet(params.userId, manager, true);

      if (
        wallet.aiVoiceMinutes < params.voiceMinutes ||
        wallet.aiTextTokens < params.textTokens
      ) {
        throw new PaymentRequiredException(
          'Your AI bundle balance is insufficient.',
        );
      }

      wallet.aiVoiceMinutes -= params.voiceMinutes;
      wallet.aiTextTokens -= params.textTokens;

      await manager.getRepository(UserStoreWallet).save(wallet);

      return {
        voiceMinutesRemaining: wallet.aiVoiceMinutes,
        textTokensRemaining: wallet.aiTextTokens,
      };
    });
  }

  async grantOrder(order: StoreOrder, manager: EntityManager) {
    const wallet = await this.getOrCreateWallet(order.userId, manager, true);

    const streak = await this.getOrCreateStreak(order.userId, manager);

    const snapshot = order.snapshot;
    const reversal = order.reversal;

    if (!snapshot || !reversal) {
      throw new BadRequestException(
        'Order snapshot or reversal record is missing.',
      );
    }

    if (snapshot.packageType === StorePackageType.AI_BUNDLE) {
      wallet.aiVoiceMinutes += snapshot.voiceMinutes ?? 0;

      wallet.aiTextTokens += snapshot.textTokens ?? 0;
    }

    if (snapshot.packageType === StorePackageType.CV_CREDIT) {
      wallet.cvCredits += snapshot.cvCreditCount ?? 0;
    }

    if (snapshot.packageType === StorePackageType.STREAK_FREEZE) {
      if (
        snapshot.streakProtectionMode === StreakProtectionMode.MONTHLY_UNLIMITED
      ) {
        const now = new Date();

        const currentExpiry =
          wallet.unlimitedStreakProtectionUntil &&
          wallet.unlimitedStreakProtectionUntil > now
            ? wallet.unlimitedStreakProtectionUntil
            : now;

        reversal.unlimitedProtectionPreviousUntil =
          wallet.unlimitedStreakProtectionUntil;

        const grantedUntil = new Date(currentExpiry);

        grantedUntil.setUTCDate(
          grantedUntil.getUTCDate() + (snapshot.protectionDurationDays ?? 30),
        );

        wallet.unlimitedStreakProtectionUntil = grantedUntil;

        reversal.unlimitedProtectionGrantedUntil = grantedUntil;
      } else {
        streak.streakFreezeCount += snapshot.freezeCount ?? 0;
      }
    }

    await manager.getRepository(UserStoreWallet).save(wallet);

    await manager.getRepository(UserStreak).save(streak);

    await manager.getRepository(StoreOrderReversal).save(reversal);

    return this.mapBalances(order.userId, wallet, manager);
  }

  /**
   * On refund only unused balance can be removed.
   *
   * For example, if the user bought 10 CV credits,
   * used 4, and then receives a refund, only the
   * remaining 6 credits can be reversed.
   */
  async reverseOrder(order: StoreOrder, manager: EntityManager) {
    const wallet = await this.getOrCreateWallet(order.userId, manager, true);

    const streak = await this.getOrCreateStreak(order.userId, manager);

    const snapshot = order.snapshot;
    const reversal = order.reversal;

    if (!snapshot || !reversal) {
      throw new BadRequestException(
        'Order snapshot or reversal record is missing.',
      );
    }

    reversal.reversedVoiceMinutes = Math.min(
      wallet.aiVoiceMinutes,
      snapshot.voiceMinutes ?? 0,
    );

    reversal.reversedTextTokens = Math.min(
      wallet.aiTextTokens,
      snapshot.textTokens ?? 0,
    );

    reversal.reversedCvCredits = Math.min(
      wallet.cvCredits,
      snapshot.cvCreditCount ?? 0,
    );

    wallet.aiVoiceMinutes -= reversal.reversedVoiceMinutes;

    wallet.aiTextTokens -= reversal.reversedTextTokens;

    wallet.cvCredits -= reversal.reversedCvCredits;

    if (
      snapshot.packageType === StorePackageType.STREAK_FREEZE &&
      snapshot.streakProtectionMode === StreakProtectionMode.MONTHLY_UNLIMITED
    ) {
      const currentExpiry =
        wallet.unlimitedStreakProtectionUntil?.getTime() ?? null;

      const grantedExpiry =
        reversal.unlimitedProtectionGrantedUntil?.getTime() ?? null;

      if (
        currentExpiry !== null &&
        grantedExpiry !== null &&
        currentExpiry === grantedExpiry
      ) {
        wallet.unlimitedStreakProtectionUntil =
          reversal.unlimitedProtectionPreviousUntil;
      }

      reversal.reversedFreezeCount = 0;
    } else {
      reversal.reversedFreezeCount = Math.min(
        streak.streakFreezeCount,
        snapshot.freezeCount ?? 0,
      );

      streak.streakFreezeCount -= reversal.reversedFreezeCount;
    }

    await manager.getRepository(UserStoreWallet).save(wallet);

    await manager.getRepository(UserStreak).save(streak);

    await manager.getRepository(StoreOrderReversal).save(reversal);

    return this.mapBalances(order.userId, wallet, manager);
  }

  async getOrCreateCvEconomyConfig(manager?: EntityManager) {
    const repository = manager
      ? manager.getRepository(CvEconomyConfig)
      : this.configRepository;

    let config = await repository.findOne({
      where: {
        configKey: 'default',
      },
    });

    if (!config) {
      config = await repository.save(
        repository.create({
          configKey: 'default',
          freeCreditsPerSignup: 2,
          allowEditingWithoutCredit: true,
          updatedByAdminId: null,
        }),
      );
    }

    return config;
  }

  private async consumeCvCreditWithManager(
    userId: string,
    manager: EntityManager,
  ) {
    const wallet = await this.getOrCreateWallet(userId, manager, true);

    if (wallet.cvCredits <= 0) {
      throw new PaymentRequiredException(
        'No CV credits are available. Purchase a CV credit package first.',
      );
    }

    wallet.cvCredits -= 1;

    await manager.getRepository(UserStoreWallet).save(wallet);

    return {
      remainingCredits: wallet.cvCredits,
    };
  }

  private async getOrCreateWallet(
    userId: string,
    manager: EntityManager,
    grantSignupCredits: boolean,
  ) {
    const repository = manager.getRepository(UserStoreWallet);

    let wallet = await repository.findOne({
      where: {
        userId,
      },
    });

    if (!wallet) {
      wallet = await repository.save(
        repository.create({
          userId,
          aiVoiceMinutes: 0,
          aiTextTokens: 0,
          cvCredits: 0,
          signupCvCreditsGrantedAt: null,
        }),
      );
    }

    if (grantSignupCredits && !wallet.signupCvCreditsGrantedAt) {
      const config = await this.getOrCreateCvEconomyConfig(manager);

      wallet.cvCredits += config.freeCreditsPerSignup;

      wallet.signupCvCreditsGrantedAt = new Date();

      wallet = await repository.save(wallet);
    }

    return wallet;
  }

  private async getOrCreateStreak(userId: string, manager: EntityManager) {
    const repository = manager.getRepository(UserStreak);

    let streak = await repository.findOne({
      where: {
        userId,
      },
    });

    if (!streak) {
      streak = await repository.save(
        repository.create({
          userId,
          currentDays: 0,
          longestDays: 0,
          lastActivityDate: null,
          lastActivityAt: null,
          streakFreezeCount: 0,
        }),
      );
    }

    return streak;
  }

  private async mapBalances(
    userId: string,
    wallet: UserStoreWallet,
    manager: EntityManager,
  ) {
    const streak = await this.getOrCreateStreak(userId, manager);
    const config = await this.getOrCreateCvEconomyConfig(manager);

    const now = new Date();

    const unlimitedProtectionActive = Boolean(
      wallet.unlimitedStreakProtectionUntil &&
      wallet.unlimitedStreakProtectionUntil > now,
    );

    return {
      ai: {
        voiceMinutes: wallet.aiVoiceMinutes,
        textTokens: wallet.aiTextTokens,
      },

      streakFreeze: {
        count: streak.streakFreezeCount,

        unlimitedProtection: {
          active: unlimitedProtectionActive,

          expiresAt: unlimitedProtectionActive
            ? wallet.unlimitedStreakProtectionUntil
            : null,
        },
      },

      cv: {
        credits: wallet.cvCredits,
        freeCreditsPerSignup: config.freeCreditsPerSignup,
        allowEditingWithoutCredit: config.allowEditingWithoutCredit,
      },
    };
  }
}
