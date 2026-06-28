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

      const grantedVoiceMinutes = params.aiVoiceMinutes ?? 0;
      wallet.aiVoiceSeconds += grantedVoiceMinutes * 60;
      wallet.aiVoiceMinutes = Math.ceil(wallet.aiVoiceSeconds / 60);
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
      if (params.voiceMinutes > 0) {
        await this.consumeAiVoiceSeconds(
          params.userId,
          params.voiceMinutes * 60,
          manager,
        );
      }
      if (params.textTokens > 0) {
        await this.consumeAiTextTokens(
          params.userId,
          params.textTokens,
          manager,
        );
      }

      const wallet = await this.getLockedWallet(params.userId, manager);
      return {
        voiceMinutesRemaining: Math.ceil(wallet.aiVoiceSeconds / 60),
        voiceSecondsRemaining: wallet.aiVoiceSeconds,
        textTokensRemaining: wallet.aiTextTokens,
      };
    });
  }

  async consumeAiTextTokens(
    userId: string,
    textTokens: number,
    manager?: EntityManager,
  ) {
    if (!Number.isInteger(textTokens) || textTokens < 0) {
      throw new BadRequestException(
        'AI text token usage must use a non-negative integer.',
      );
    }

    if (!manager) {
      return this.dataSource.transaction((transactionManager) =>
        this.consumeAiTextTokens(userId, textTokens, transactionManager),
      );
    }

    const wallet = await this.getLockedWallet(userId, manager);
    if (wallet.aiTextTokens < textTokens) {
      throw new PaymentRequiredException(
        'Your AI text token balance is insufficient.',
      );
    }

    wallet.aiTextTokens -= textTokens;
    await manager.getRepository(UserStoreWallet).save(wallet);

    return this.mapBalances(userId, wallet, manager);
  }

  async consumeAiVoiceSeconds(
    userId: string,
    voiceSeconds: number,
    manager?: EntityManager,
  ) {
    if (!Number.isInteger(voiceSeconds) || voiceSeconds < 0) {
      throw new BadRequestException(
        'AI voice usage must use a non-negative number of seconds.',
      );
    }

    if (!manager) {
      return this.dataSource.transaction((transactionManager) =>
        this.consumeAiVoiceSeconds(userId, voiceSeconds, transactionManager),
      );
    }

    const wallet = await this.getLockedWallet(userId, manager);
    if (wallet.aiVoiceSeconds < voiceSeconds) {
      throw new PaymentRequiredException(
        'Your AI voice balance is insufficient.',
      );
    }

    wallet.aiVoiceSeconds -= voiceSeconds;
    wallet.aiVoiceMinutes = Math.ceil(wallet.aiVoiceSeconds / 60);
    await manager.getRepository(UserStoreWallet).save(wallet);

    return this.mapBalances(userId, wallet, manager);
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
      wallet.aiVoiceSeconds += (snapshot.voiceMinutes ?? 0) * 60;
      wallet.aiVoiceMinutes = Math.ceil(wallet.aiVoiceSeconds / 60);

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
      Math.floor(wallet.aiVoiceSeconds / 60),
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

    wallet.aiVoiceSeconds -= reversal.reversedVoiceMinutes * 60;
    wallet.aiVoiceMinutes = Math.ceil(wallet.aiVoiceSeconds / 60);

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

  private async getLockedWallet(
    userId: string,
    manager: EntityManager,
  ) {
    await this.getOrCreateWallet(userId, manager, true);

    const wallet = await manager.getRepository(UserStoreWallet).findOne({
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!wallet) {
      throw new BadRequestException('AI wallet could not be initialized.');
    }

    if (wallet.aiVoiceSeconds === 0 && wallet.aiVoiceMinutes > 0) {
      wallet.aiVoiceSeconds = wallet.aiVoiceMinutes * 60;
      await manager.getRepository(UserStoreWallet).save(wallet);
    }

    return wallet;
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
          aiVoiceSeconds: 0,
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
        voiceMinutes: wallet.aiVoiceSeconds / 60,
        voiceSeconds: wallet.aiVoiceSeconds,
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
