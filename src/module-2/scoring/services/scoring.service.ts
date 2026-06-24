import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';

import { UserXpBoost, XpBoostSource } from '../entities/user-xp-boost.entity';
import {
  XpTransaction,
  XpTransactionSource,
} from '../entities/xp-transaction.entity';

export interface XpBoostState {
  isActive: boolean;
  multiplier: number;
  remainingSeconds: number | null;
  expiresAt: Date | null;
}

export interface XpRewardSummary {
  baseXp: number;
  bonusXp: number;
  boostMultiplier: number;
  boostXp: number;
  totalXpEarned: number;
  xpBoost: XpBoostState;
}

interface RecordLessonCompletionXpPayload {
  userId: string;
  lessonId: string;
  baseXp: number;
}

interface RecordQuizCompletionXpPayload {
  userId: string;
  sessionId: string;
  lessonId: string;
  baseXp: number;
  bonusXp: number;
  scoringMetadata?: Record<string, unknown>;
}

interface RecordDailyChestXpPayload {
  userId: string;
  rewardId: string;
  baseXp: number;
}

interface RecordManualXpPayload {
  userId: string;
  sourceId: string;
  amount: number;
  reason: string;
}

interface RecordXpTransactionPayload {
  userId: string;
  source: XpTransactionSource;
  sourceId: string;
  baseXp: number;
  bonusXp: number;
  reason: string;
  applyBoost: boolean;
}

@Injectable()
export class ScoringService {
  constructor(
    @InjectRepository(XpTransaction)
    private readonly xpTransactionRepository: Repository<XpTransaction>,

    @InjectRepository(UserXpBoost)
    private readonly userXpBoostRepository: Repository<UserXpBoost>,
  ) {}

  async recordQuizCompletionXp(
    payload: RecordQuizCompletionXpPayload,
  ): Promise<XpRewardSummary> {
    const existingTransaction = await this.xpTransactionRepository.findOne({
      where: {
        source: XpTransactionSource.QUIZ_SESSION,
        sourceId: payload.sessionId,
      },
    });

    if (existingTransaction) {
      return this.buildRewardSummaryFromTransaction(existingTransaction);
    }

    return this.recordXpTransaction({
      userId: payload.userId,
      source: XpTransactionSource.QUIZ_SESSION,
      sourceId: payload.sessionId,
      baseXp: payload.baseXp,
      bonusXp: payload.bonusXp,
      reason: 'Quiz completion reward',
      applyBoost: true,
    });
  }

  async recordLessonCompletionXp(
    payload: RecordLessonCompletionXpPayload,
  ): Promise<XpRewardSummary> {
    /*
     * Include userId because the same lesson can be
     * completed by many different users.
     */
    const sourceId = `user:${payload.userId}:lesson:${payload.lessonId}`;

    const existingTransaction = await this.xpTransactionRepository.findOne({
      where: {
        source: XpTransactionSource.LESSON_COMPLETION,
        sourceId,
      },
    });

    if (existingTransaction) {
      return this.buildRewardSummaryFromTransaction(existingTransaction);
    }

    return this.recordXpTransaction({
      userId: payload.userId,
      source: XpTransactionSource.LESSON_COMPLETION,
      sourceId,
      baseXp: payload.baseXp,
      bonusXp: 0,
      reason: 'Lesson completion reward',
      applyBoost: true,
    });
  }

  async findQuizCompletionXp(
    sessionId: string,
  ): Promise<XpRewardSummary | null> {
    const transaction = await this.xpTransactionRepository.findOne({
      where: {
        source: XpTransactionSource.QUIZ_SESSION,
        sourceId: sessionId,
      },
    });

    if (!transaction) {
      return null;
    }

    return this.buildRewardSummaryFromTransaction(transaction);
  }

  async recordDailyChestXp(
    payload: RecordDailyChestXpPayload,
  ): Promise<XpRewardSummary> {
    const existingTransaction = await this.xpTransactionRepository.findOne({
      where: {
        source: XpTransactionSource.DAILY_CHALLENGE,
        sourceId: payload.rewardId,
      },
    });

    if (existingTransaction) {
      return this.buildRewardSummaryFromTransaction(existingTransaction);
    }

    return this.recordXpTransaction({
      userId: payload.userId,
      source: XpTransactionSource.DAILY_CHALLENGE,
      sourceId: payload.rewardId,
      baseXp: payload.baseXp,
      bonusXp: 0,
      reason: 'Daily chest reward',
      applyBoost: true,
    });
  }

  async recordManualXp(
    payload: RecordManualXpPayload,
  ): Promise<XpRewardSummary> {
    const existingTransaction = await this.xpTransactionRepository.findOne({
      where: {
        source: XpTransactionSource.MANUAL_ADJUSTMENT,
        sourceId: payload.sourceId,
      },
    });

    if (existingTransaction) {
      return this.buildRewardSummaryFromTransaction(existingTransaction);
    }

    return this.recordXpTransaction({
      userId: payload.userId,
      source: XpTransactionSource.MANUAL_ADJUSTMENT,
      sourceId: payload.sourceId,
      baseXp: payload.amount,
      bonusXp: 0,
      reason: payload.reason,
      applyBoost: false,
    });
  }

  async getActiveXpBoost(userId: string): Promise<XpBoostState> {
    const now = new Date();

    const activeBoost = await this.userXpBoostRepository.findOne({
      where: {
        userId,
        isActive: true,
        expiresAt: MoreThan(now),
      },
      order: {
        expiresAt: 'DESC',
      },
    });

    if (!activeBoost) {
      return {
        isActive: false,
        multiplier: 1,
        remainingSeconds: null,
        expiresAt: null,
      };
    }

    const remainingSeconds = Math.max(
      0,
      Math.floor((activeBoost.expiresAt.getTime() - now.getTime()) / 1000),
    );

    return {
      isActive: true,
      multiplier: Number(activeBoost.multiplier),
      remainingSeconds,
      expiresAt: activeBoost.expiresAt,
    };
  }

  async createXpBoost(params: {
    userId: string;
    multiplier?: number;
    durationSeconds: number;
    source?: XpBoostSource;
  }) {
    const now = new Date();

    const boost = this.userXpBoostRepository.create({
      userId: params.userId,
      multiplier: params.multiplier ?? 2,
      source: params.source ?? XpBoostSource.PROMOTION,
      startsAt: now,
      expiresAt: new Date(now.getTime() + params.durationSeconds * 1000),
      isActive: true,
    });

    return this.userXpBoostRepository.save(boost);
  }

  async getUserTotalXp(userId: string) {
    const result = await this.xpTransactionRepository
      .createQueryBuilder('transaction')
      .select('COALESCE(SUM(transaction.amount), 0)', 'totalXp')
      .where('transaction.userId = :userId', { userId })
      .getRawOne<{ totalXp: string }>();

    return Number(result?.totalXp ?? 0);
  }

  private async recordXpTransaction(
    payload: RecordXpTransactionPayload,
  ): Promise<XpRewardSummary> {
    const boost = payload.applyBoost
      ? await this.getActiveXpBoost(payload.userId)
      : {
          isActive: false,
          multiplier: 1,
          remainingSeconds: null,
          expiresAt: null,
        };

    const beforeBoostTotal = payload.baseXp + payload.bonusXp;
    const boostMultiplier = boost.isActive ? boost.multiplier : 1;
    const totalXpEarned = Math.round(beforeBoostTotal * boostMultiplier);
    const boostXp = Math.max(0, totalXpEarned - beforeBoostTotal);

    const transaction = this.xpTransactionRepository.create({
      userId: payload.userId,
      source: payload.source,
      sourceId: payload.sourceId,
      amount: totalXpEarned,
      baseAmount: payload.baseXp,
      bonusAmount: payload.bonusXp,
      multiplier: boostMultiplier,
      boostAmount: boostXp,
      reason: payload.reason,
    });

    await this.xpTransactionRepository.save(transaction);

    return {
      baseXp: payload.baseXp,
      bonusXp: payload.bonusXp,
      boostMultiplier,
      boostXp,
      totalXpEarned,
      xpBoost: boost,
    };
  }

  private buildRewardSummaryFromTransaction(
    transaction: XpTransaction,
  ): XpRewardSummary {
    return {
      baseXp: transaction.baseAmount,
      bonusXp: transaction.bonusAmount,
      boostMultiplier: Number(transaction.multiplier),
      boostXp: transaction.boostAmount,
      totalXpEarned: transaction.amount,
      xpBoost: {
        isActive: Number(transaction.multiplier) > 1,
        multiplier: Number(transaction.multiplier),
        remainingSeconds: null,
        expiresAt: null,
      },
    };
  }
}
