import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, MoreThanOrEqual, Repository } from 'typeorm';

import { ScoringService } from 'src/module-2/scoring/services/scoring.service';
import { StreakService } from 'src/module-2/scoring/services/streak.service';
import { RecordLearningActivityDto } from '../dto/daily-challenge.dto';
import { DailyChallengePlanTask } from '../entities/daily-challenge-plan-task.entity';
import { DailyChallengePlan } from '../entities/daily-challenge-plan.entity';
import {
  DailyChestRewardType,
  UserDailyChestReward,
} from '../entities/user-daily-chest-reward.entity';
import {
  DailyChallengeProgressStatus,
  UserDailyChallengeProgress,
} from '../entities/user-daily-challenge-progress.entity';
import {
  DailyChallengeTaskKey,
  LearningActivityType,
} from '../types/daily-challenge.type';
import { DAILY_CHALLENGE_VARIATIONS } from '../types/daily-challenge-variations';
import { DailyLearningActivityLog } from '../entities/daily-learning-activity-log.entity';
import { LeaderboardXpService } from 'src/module-2/leaderboard/services/leaderboard-xp.service';
import { LeaderboardXpSourceType } from 'src/module-2/leaderboard/types/leaderboard.type';
import {
  XpTransaction,
  XpTransactionSource,
} from 'src/module-2/scoring/entities/xp-transaction.entity';
import { UserLearningActivityTimeEntry } from 'src/module-2/learning-activity/entities/user-learning-activity-time-entry.entity';

interface DailyChallengeUser {
  id: string;
}

interface DailyChallengePlanWithTasks {
  plan: DailyChallengePlan;
  tasks: DailyChallengePlanTask[];
}

interface InternalLearningActivityPayload {
  userId: string;
  activityType: LearningActivityType;
  sourceId: string;
  value?: number;
  clientActivityDate?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class DailyChallengesService {
  constructor(
    @InjectRepository(DailyChallengePlan)
    private readonly planRepository: Repository<DailyChallengePlan>,

    @InjectRepository(DailyChallengePlanTask)
    private readonly planTaskRepository: Repository<DailyChallengePlanTask>,

    @InjectRepository(UserDailyChallengeProgress)
    private readonly progressRepository: Repository<UserDailyChallengeProgress>,

    @InjectRepository(UserDailyChestReward)
    private readonly chestRewardRepository: Repository<UserDailyChestReward>,

    @InjectRepository(DailyLearningActivityLog)
    private readonly activityLogRepository: Repository<DailyLearningActivityLog>,

    @InjectRepository(XpTransaction)
    private readonly xpTransactionRepository: Repository<XpTransaction>,

    @InjectRepository(UserLearningActivityTimeEntry)
    private readonly learningTimeRepository: Repository<UserLearningActivityTimeEntry>,

    private readonly scoringService: ScoringService,
    private readonly streakService: StreakService,
    private readonly leaderboardXpService: LeaderboardXpService,
  ) {}

  private readonly logger = new Logger(DailyChallengesService.name);

  async getToday(user: DailyChallengeUser, date?: string) {
    const challengeDate = this.resolveChallengeDate(date);
    const planWithTasks = await this.getOrCreatePlan(challengeDate);
    let progress = await this.ensureUserProgress(user.id, planWithTasks);
    await this.reconcileAuthoritativeProgress(user.id, challengeDate, progress);
    progress = await this.progressRepository.find({
      where: { userId: user.id, challengeDate },
      order: { createdAt: 'ASC' },
    });

    const chest = await this.chestRewardRepository.findOne({
      where: { userId: user.id, challengeDate },
    });

    const streak = await this.streakService.getUserStreak(
      user.id,
      challengeDate,
    );
    const totalXp = await this.scoringService.getUserTotalXp(user.id);
    const xpBoost = await this.scoringService.getActiveXpBoost(user.id);

    return {
      challengeDate,
      variationKey: planWithTasks.plan.variationKey,
      totalXp,
      streak,
      xpBoost,
      tasks: this.sortProgress(progress),
      chest: {
        isUnlocked: progress.every(
          (item) =>
            item.status === DailyChallengeProgressStatus.COMPLETED ||
            item.status === DailyChallengeProgressStatus.CLAIMED,
        ),
        isOpened: Boolean(chest),
        reward: chest ?? null,
      },
    };
  }

  async getTodayHomeSummary(userId: string, date?: string) {
    const challengeDate = this.resolveChallengeDate(date);
    const [planWithTasks, streak] = await Promise.all([
      this.getOrCreatePlan(challengeDate),
      this.streakService.getUserStreak(userId, challengeDate),
    ]);
    let progress = await this.ensureUserProgress(userId, planWithTasks);
    await this.reconcileAuthoritativeProgress(userId, challengeDate, progress);
    progress = await this.progressRepository.find({
      where: { userId, challengeDate },
      order: { createdAt: 'ASC' },
    });
    const completed = progress.filter(
      (item) =>
        item.status === DailyChallengeProgressStatus.COMPLETED ||
        item.status === DailyChallengeProgressStatus.CLAIMED,
    ).length;

    return {
      completed,
      total: progress.length,
      streakDays: streak.currentDays,
    };
  }

  async recordInternalActivity(
    payload: InternalLearningActivityPayload,
  ): Promise<boolean> {
    try {
      await this.recordActivity(
        { id: payload.userId },
        {
          activityType: payload.activityType,
          value: payload.value ?? 1,
          sourceId: payload.sourceId,
          clientActivityDate: payload.clientActivityDate,
          metadata: payload.metadata,
        },
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Daily challenge activity failed: ${payload.activityType} for user ${payload.userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      // Daily Challenges are a side effect. Report the failure prominently but
      // never fail the lesson/quiz action that produced it.
      return false;
    }
  }

  async recordActivity(
    user: DailyChallengeUser,
    dto: RecordLearningActivityDto,
  ) {
    const activityDate = this.resolveChallengeDate(dto.clientActivityDate);

    const planWithTasks = await this.getOrCreatePlan(activityDate);
    await this.ensureUserProgress(user.id, planWithTasks);
    const updates = await this.removeDerivedFallbackUpdates(
      user.id,
      activityDate,
      this.mapActivityToTaskUpdates(dto),
    );

    // Streak updates are already date-idempotent. Run this before activity
    // registration so a transient failure does not leave a committed activity
    // log that prevents a safe retry.
    await this.streakService.updateDailyStreak(
      user.id,
      activityDate,
      new Date(),
    );

    await this.progressRepository.manager.transaction(async (manager) => {
      const registered = await this.registerActivityIfNew(
        user.id,
        dto,
        activityDate,
        manager,
      );
      if (!registered) {
        return;
      }

      const progressRepository = manager.getRepository(
        UserDailyChallengeProgress,
      );
      for (const update of updates) {
        await this.incrementTaskProgressWithRepository(
          progressRepository,
          user.id,
          activityDate,
          update.taskKey,
          update.value,
        );
      }
    });

    return this.getToday(user, activityDate);
  }

  private async registerActivityIfNew(
    userId: string,
    dto: RecordLearningActivityDto,
    activityDate: string,
    manager?: EntityManager,
  ) {
    if (!dto.sourceId) {
      return true;
    }

    const repository = manager
      ? manager.getRepository(DailyLearningActivityLog)
      : this.activityLogRepository;
    const existingLog = await repository.findOne({
      where: {
        userId,
        activityType: dto.activityType,
        sourceId: dto.sourceId,
        ...(dto.metadata?.dedupeAcrossDates === true ? {} : { activityDate }),
      },
    });

    if (existingLog) {
      return false;
    }

    const insertResult = await repository
      .createQueryBuilder()
      .insert()
      .values({
        userId,
        activityType: dto.activityType,
        sourceId: dto.sourceId,
        activityDate,
        value: dto.value ?? 1,
      })
      .orIgnore()
      .returning('id')
      .execute();

    // ON CONFLICT avoids aborting the surrounding PostgreSQL transaction when
    // two identical retries arrive concurrently.
    return Array.isArray(insertResult.raw) && insertResult.raw.length > 0;
  }

  async claimTask(
    user: DailyChallengeUser,
    taskKey: DailyChallengeTaskKey,
    challengeDateInput?: string,
  ) {
    const challengeDate = this.resolveChallengeDate(challengeDateInput);
    const planWithTasks = await this.getOrCreatePlan(challengeDate);

    await this.ensureUserProgress(user.id, planWithTasks);

    await this.progressRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(UserDailyChallengeProgress);
      const progress = await repository.findOne({
        where: { userId: user.id, challengeDate, taskKey },
        lock: { mode: 'pessimistic_write' },
      });

      if (!progress) {
        throw new NotFoundException('Daily challenge task not found');
      }
      if (progress.status === DailyChallengeProgressStatus.IN_PROGRESS) {
        throw new BadRequestException('Task is not completed yet');
      }
      if (progress.status === DailyChallengeProgressStatus.CLAIMED) {
        return;
      }

      // Both XP writes are idempotent. Mark CLAIMED only after they succeed so
      // a retry can repair an interrupted reward without losing the task XP.
      const reward = await this.scoringService.recordManualXp({
        userId: user.id,
        sourceId: `daily-task:${progress.id}`,
        amount: progress.rewardXp,
        reason: 'Daily challenge task reward',
      });
      const streak = await this.streakService.getUserStreakSummary(user.id);
      await this.leaderboardXpService.awardXp({
        userId: user.id,
        sourceType: LeaderboardXpSourceType.DAILY_CHALLENGE,
        sourceReference: progress.id,
        idempotencyKey: `daily-task:${progress.id}:leaderboard-xp`,
        baseXp: reward.baseXp,
        streakBonusXp: 0,
        masteryBonusXp: 0,
        speedBonusXp: 0,
        awardedXp: reward.totalXpEarned,
        multiplier: reward.boostMultiplier,
        streakDays: streak.currentDays,
      });

      progress.status = DailyChallengeProgressStatus.CLAIMED;
      progress.claimedAt = new Date();
      await repository.save(progress);
    });

    return this.getToday(user, challengeDate);
  }

  async openDailyChest(user: DailyChallengeUser, challengeDateInput?: string) {
    const challengeDate = this.resolveChallengeDate(challengeDateInput);
    const planWithTasks = await this.getOrCreatePlan(challengeDate);
    const progress = await this.ensureUserProgress(user.id, planWithTasks);

    const allCompleted = progress.every(
      (item) =>
        item.status === DailyChallengeProgressStatus.COMPLETED ||
        item.status === DailyChallengeProgressStatus.CLAIMED,
    );

    if (!allCompleted) {
      throw new BadRequestException(
        'Complete all three daily challenges before opening the chest',
      );
    }

    const existingReward = await this.chestRewardRepository.findOne({
      where: { userId: user.id, challengeDate },
    });

    if (existingReward) {
      return existingReward;
    }

    const xpAmount = this.getRandomXpReward();
    const freezeEligible = await this.canRewardStreakFreeze(user.id);
    const shouldRewardFreeze = freezeEligible && this.rollPercent(10);
    const rewardIncludesXp = !shouldRewardFreeze || this.rollPercent(50);
    const finalXpAmount = rewardIncludesXp ? xpAmount : 0;

    const rewardType = this.getRewardType(finalXpAmount, shouldRewardFreeze);

    const draftReward = this.chestRewardRepository.create({
      userId: user.id,
      challengeDate,
      rewardType,
      xpAmount: finalXpAmount,
      boostMultiplier: 1,
      boostXp: 0,
      totalXpAwarded: finalXpAmount,
      streakFreezeCount: shouldRewardFreeze ? 1 : 0,
      openedAt: new Date(),
    });

    const savedReward = await this.chestRewardRepository.save(draftReward);

    if (finalXpAmount > 0) {
      const xpReward = await this.scoringService.recordDailyChestXp({
        userId: user.id,
        rewardId: savedReward.id,
        baseXp: finalXpAmount,
      });

      savedReward.boostMultiplier = xpReward.boostMultiplier;

      savedReward.boostXp = xpReward.boostXp;

      savedReward.totalXpAwarded = xpReward.totalXpEarned;

      const streak = await this.streakService.getUserStreakSummary(user.id);

      await this.leaderboardXpService.awardXp({
        userId: user.id,
        sourceType: LeaderboardXpSourceType.DAILY_CHALLENGE,
        sourceReference: savedReward.id,
        idempotencyKey: `daily-chest:${savedReward.id}:leaderboard-xp`,
        baseXp: xpReward.baseXp,
        streakBonusXp: 0,
        masteryBonusXp: 0,
        speedBonusXp: 0,
        awardedXp: xpReward.totalXpEarned,
        multiplier: xpReward.boostMultiplier,
        streakDays: streak.currentDays,
      });
    }

    if (shouldRewardFreeze) {
      await this.streakService.addStreakFreeze(user.id, 1);
    }

    return this.chestRewardRepository.save(savedReward);
  }

  private async getOrCreatePlan(
    challengeDate: string,
  ): Promise<DailyChallengePlanWithTasks> {
    return this.planRepository.manager.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`daily-challenge-plan:${challengeDate}`],
      );

      const planRepository = manager.getRepository(DailyChallengePlan);
      const taskRepository = manager.getRepository(DailyChallengePlanTask);
      const existingPlan = await planRepository.findOne({
        where: { challengeDate },
      });
      if (existingPlan) {
        let tasks = await taskRepository.find({
          where: { planId: existingPlan.id },
          order: { sortOrder: 'ASC' },
        });
        const variation = DAILY_CHALLENGE_VARIATIONS.find(
          (item) => item.key === existingPlan.variationKey,
        );
        if (variation) {
          const existingKeys = new Set(tasks.map((task) => task.taskKey));
          const missing = variation.tasks
            .map((task, index) => ({ task, index }))
            .filter(({ task }) => !existingKeys.has(task.key));
          if (missing.length > 0) {
            await taskRepository
              .createQueryBuilder()
              .insert()
              .values(
                missing.map(({ task, index }) => ({
                  planId: existingPlan.id,
                  taskKey: task.key,
                  title: task.title,
                  targetValue: task.targetValue,
                  rewardXp: task.rewardXp,
                  sortOrder: index + 1,
                })),
              )
              .orIgnore()
              .execute();
            tasks = await taskRepository.find({
              where: { planId: existingPlan.id },
              order: { sortOrder: 'ASC' },
            });
          }
        }
        return {
          plan: existingPlan,
          tasks,
        };
      }

      const variation = this.pickVariation(challengeDate);
      const savedPlan = await planRepository.save(
        planRepository.create({
          challengeDate,
          variationKey: variation.key,
        }),
      );
      const savedTasks = await taskRepository.save(
        variation.tasks.map((task, index) =>
          taskRepository.create({
            planId: savedPlan.id,
            taskKey: task.key,
            title: task.title,
            targetValue: task.targetValue,
            rewardXp: task.rewardXp,
            sortOrder: index + 1,
          }),
        ),
      );

      return { plan: savedPlan, tasks: savedTasks };
    });
  }

  private async ensureUserProgress(
    userId: string,
    planWithTasks: DailyChallengePlanWithTasks,
  ) {
    const existing = await this.progressRepository.find({
      where: {
        userId,
        challengeDate: planWithTasks.plan.challengeDate,
      },
    });

    const existingTaskKeys = new Set(existing.map((item) => item.taskKey));

    const missingTasks = planWithTasks.tasks.filter(
      (task) => !existingTaskKeys.has(task.taskKey),
    );

    if (missingTasks.length > 0) {
      await this.progressRepository
        .createQueryBuilder()
        .insert()
        .values(
          missingTasks.map((task) => ({
            userId,
            challengeDate: planWithTasks.plan.challengeDate,
            taskKey: task.taskKey,
            title: task.title,
            targetValue: task.targetValue,
            progressValue: 0,
            rewardXp: task.rewardXp,
            status: DailyChallengeProgressStatus.IN_PROGRESS,
            completedAt: null,
            claimedAt: null,
          })),
        )
        .orIgnore()
        .execute();
    }

    return this.progressRepository.find({
      where: {
        userId,
        challengeDate: planWithTasks.plan.challengeDate,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  private async incrementTaskProgress(
    userId: string,
    challengeDate: string,
    taskKey: DailyChallengeTaskKey,
    value: number,
  ) {
    await this.progressRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(UserDailyChallengeProgress);
      await this.incrementTaskProgressWithRepository(
        repository,
        userId,
        challengeDate,
        taskKey,
        value,
      );
    });
  }

  private async incrementTaskProgressWithRepository(
    repository: Repository<UserDailyChallengeProgress>,
    userId: string,
    challengeDate: string,
    taskKey: DailyChallengeTaskKey,
    value: number,
  ) {
    const progress = await repository.findOne({
      where: { userId, challengeDate, taskKey },
      lock: { mode: 'pessimistic_write' },
    });

    if (
      !progress ||
      progress.status !== DailyChallengeProgressStatus.IN_PROGRESS
    ) {
      return;
    }

    progress.progressValue = Math.min(
      progress.progressValue + value,
      progress.targetValue,
    );
    if (progress.progressValue >= progress.targetValue) {
      progress.status = DailyChallengeProgressStatus.COMPLETED;
      progress.completedAt ??= new Date();
    }
    await repository.save(progress);
  }

  async recordAbsoluteTaskProgress(params: {
    userId: string;
    challengeDate?: string;
    taskKey: DailyChallengeTaskKey;
    value: number;
  }) {
    const challengeDate = this.resolveChallengeDate(params.challengeDate);
    const planWithTasks = await this.getOrCreatePlan(challengeDate);
    await this.ensureUserProgress(params.userId, planWithTasks);

    await this.progressRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(UserDailyChallengeProgress);
      const progress = await repository.findOne({
        where: {
          userId: params.userId,
          challengeDate,
          taskKey: params.taskKey,
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (
        !progress ||
        progress.status !== DailyChallengeProgressStatus.IN_PROGRESS
      ) {
        return;
      }

      progress.progressValue = Math.min(
        Math.max(progress.progressValue, Math.max(0, params.value)),
        progress.targetValue,
      );
      if (progress.progressValue >= progress.targetValue) {
        progress.status = DailyChallengeProgressStatus.COMPLETED;
        progress.completedAt ??= new Date();
      }
      await repository.save(progress);
    });
  }

  private async reconcileAuthoritativeProgress(
    userId: string,
    challengeDate: string,
    progress: UserDailyChallengeProgress[],
  ) {
    const start = new Date(`${challengeDate}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const needsXp = progress.some(
      (item) =>
        item.taskKey === DailyChallengeTaskKey.EARN_XP_50 ||
        item.taskKey === DailyChallengeTaskKey.EARN_XP_100,
    );
    const needsLearningTime = progress.some(
      (item) => item.taskKey === DailyChallengeTaskKey.ACTIVE_LEARNING_MINUTES,
    );
    const [xpResult, timeResult] = await Promise.all([
      needsXp
        ? this.xpTransactionRepository
            .createQueryBuilder('xp')
            .select('COALESCE(SUM(xp.amount), 0)', 'amount')
            .where('xp.userId = :userId', { userId })
            .andWhere(
              '(xp.activityDate = :challengeDate OR (xp.activityDate IS NULL AND xp.createdAt >= :start AND xp.createdAt < :end))',
              { challengeDate, start, end },
            )
            .andWhere('xp.source != :dailyChallengeSource', {
              dailyChallengeSource: XpTransactionSource.DAILY_CHALLENGE,
            })
            .andWhere(
              'NOT (xp.source = :manualSource AND xp.sourceId LIKE :dailyTaskPrefix)',
              {
                manualSource: XpTransactionSource.MANUAL_ADJUSTMENT,
                dailyTaskPrefix: 'daily-task:%',
              },
            )
            .getRawOne<{ amount: string }>()
        : Promise.resolve({ amount: '0' }),
      needsLearningTime
        ? this.learningTimeRepository
            .createQueryBuilder('entry')
            .select('COALESCE(SUM(entry.durationSeconds), 0)', 'seconds')
            .where('entry.userId = :userId', { userId })
            .andWhere('entry.activityDate = :challengeDate', { challengeDate })
            .getRawOne<{ seconds: string }>()
        : Promise.resolve({ seconds: '0' }),
    ]);

    const xpEarned = Number(xpResult?.amount ?? 0);
    const trackedSeconds = Number(timeResult?.seconds ?? 0);

    for (const item of progress) {
      if (item.status === DailyChallengeProgressStatus.CLAIMED) {
        continue;
      }

      let authoritativeValue: number | null = null;
      if (
        item.taskKey === DailyChallengeTaskKey.EARN_XP_50 ||
        item.taskKey === DailyChallengeTaskKey.EARN_XP_100
      ) {
        authoritativeValue = xpEarned;
      } else if (
        item.taskKey === DailyChallengeTaskKey.ACTIVE_LEARNING_MINUTES &&
        trackedSeconds > 0
      ) {
        // The real timer wins once it has data. Legacy minute events remain a
        // fallback for released clients/days that have no timer entries.
        authoritativeValue = Math.floor(trackedSeconds / 60);
      }

      if (authoritativeValue === null) {
        continue;
      }

      // Never invalidate historical completion state. Reconciliation makes
      // in-progress rows authoritative, while completed/claimed production
      // rows remain intact as required for backwards compatibility.
      if (
        item.status === DailyChallengeProgressStatus.COMPLETED &&
        authoritativeValue < item.targetValue
      ) {
        continue;
      }

      item.progressValue = Math.min(authoritativeValue, item.targetValue);
      if (item.progressValue >= item.targetValue) {
        item.status = DailyChallengeProgressStatus.COMPLETED;
        item.completedAt ??= new Date();
      } else {
        item.status = DailyChallengeProgressStatus.IN_PROGRESS;
        item.completedAt = null;
      }
      await this.progressRepository.save(item);
    }
  }

  private async removeDerivedFallbackUpdates(
    userId: string,
    challengeDate: string,
    updates: { taskKey: DailyChallengeTaskKey; value: number }[],
  ) {
    const hasXpUpdate = updates.some(
      (item) =>
        item.taskKey === DailyChallengeTaskKey.EARN_XP_50 ||
        item.taskKey === DailyChallengeTaskKey.EARN_XP_100,
    );
    const hasTimeUpdate = updates.some(
      (item) => item.taskKey === DailyChallengeTaskKey.ACTIVE_LEARNING_MINUTES,
    );
    if (!hasXpUpdate && !hasTimeUpdate) {
      return updates;
    }

    const [xpCount, timeCount] = await Promise.all([
      hasXpUpdate
        ? this.xpTransactionRepository.count({
            where: { userId, activityDate: challengeDate },
          })
        : Promise.resolve(0),
      hasTimeUpdate
        ? this.learningTimeRepository.count({
            where: { userId, activityDate: challengeDate },
          })
        : Promise.resolve(0),
    ]);

    return updates.filter((item) => {
      if (
        xpCount > 0 &&
        (item.taskKey === DailyChallengeTaskKey.EARN_XP_50 ||
          item.taskKey === DailyChallengeTaskKey.EARN_XP_100)
      ) {
        return false;
      }
      if (
        timeCount > 0 &&
        item.taskKey === DailyChallengeTaskKey.ACTIVE_LEARNING_MINUTES
      ) {
        return false;
      }
      return true;
    });
  }

  private mapActivityToTaskUpdates(dto: RecordLearningActivityDto) {
    const value = dto.value ?? 1;
    const metadata = dto.metadata ?? {};
    const updates: { taskKey: DailyChallengeTaskKey; value: number }[] = [];

    switch (dto.activityType) {
      case LearningActivityType.VOCABULARY_WORD_LEARNED:
        updates.push({
          taskKey: DailyChallengeTaskKey.LEARN_NEW_WORDS,
          value,
        });

        if (metadata.isVerb === true) {
          updates.push({
            taskKey: DailyChallengeTaskKey.LEARN_VERBS,
            value,
          });
        }

        break;

      case LearningActivityType.VOCABULARY_FLASHCARD_REVIEWED:
        updates.push(
          {
            taskKey: DailyChallengeTaskKey.FLASHCARD_SWIPES,
            value,
          },
          {
            taskKey: DailyChallengeTaskKey.REVIEW_VOCAB_WORDS,
            value,
          },
        );

        break;

      case LearningActivityType.VOCABULARY_WEAK_WORD_CLEARED:
        updates.push({
          taskKey: DailyChallengeTaskKey.CLEAR_WEAK_FLASHCARDS,
          value,
        });

        break;

      case LearningActivityType.QUIZ_COMPLETED:
        if (Number(metadata.scorePercentage ?? 0) >= 80) {
          updates.push({
            taskKey: DailyChallengeTaskKey.QUIZ_SCORE_80,
            value: 1,
          });
        }

        if (metadata.fastFinishAchieved === true) {
          updates.push({
            taskKey: DailyChallengeTaskKey.EARN_FAST_FINISH_BONUS,
            value: 1,
          });
        }

        if (Number(metadata.longestStreak ?? 0) >= 5) {
          updates.push({
            taskKey: DailyChallengeTaskKey.ANSWER_COMBO_5,
            value: 5,
          });
        }

        if (metadata.matchPairsPerfect === true) {
          updates.push({
            taskKey: DailyChallengeTaskKey.MATCH_PAIRS_100,
            value: 1,
          });
        }

        if (metadata.completedAfterVideo === true) {
          updates.push({
            taskKey: DailyChallengeTaskKey.COMPLETE_CHAPTER_QUIZ_AFTER_VIDEO,
            value: 1,
          });
        }

        if (metadata.audioTranscriptionNoMistakes === true) {
          updates.push({
            taskKey: DailyChallengeTaskKey.AUDIO_TRANSCRIPTION_NO_MISTAKES,
            value: 1,
          });
        }

        if (metadata.trueFalseAudioCorrectCount) {
          updates.push({
            taskKey: DailyChallengeTaskKey.TRUE_FALSE_AUDIO_CORRECT,
            value: Number(metadata.trueFalseAudioCorrectCount),
          });
        }

        if (metadata.fillBlankCorrectCount) {
          updates.push({
            taskKey: DailyChallengeTaskKey.FILL_BLANK_CORRECT,
            value: Number(metadata.fillBlankCorrectCount),
          });
        }

        break;

      case LearningActivityType.QUIZ_SCORE_80:
        updates.push({
          taskKey: DailyChallengeTaskKey.QUIZ_SCORE_80,
          value: 1,
        });

        break;

      case LearningActivityType.QUIZ_FAST_FINISH_BONUS:
        updates.push({
          taskKey: DailyChallengeTaskKey.EARN_FAST_FINISH_BONUS,
          value: 1,
        });

        break;

      case LearningActivityType.QUIZ_ANSWER_COMBO:
        updates.push({
          taskKey: DailyChallengeTaskKey.ANSWER_COMBO_5,
          value,
        });

        break;

      case LearningActivityType.QUIZ_FILL_BLANKS_CORRECT:
        updates.push({
          taskKey: DailyChallengeTaskKey.FILL_BLANK_CORRECT,
          value,
        });

        break;

      case LearningActivityType.QUIZ_MATCH_PAIRS_PERFECT:
        updates.push({
          taskKey: DailyChallengeTaskKey.MATCH_PAIRS_100,
          value: 1,
        });

        break;

      case LearningActivityType.QUIZ_AUDIO_TRANSCRIPTION_CORRECT:
        updates.push({
          taskKey: DailyChallengeTaskKey.AUDIO_TRANSCRIPTION_NO_MISTAKES,
          value,
        });

        break;

      case LearningActivityType.QUIZ_TRUE_FALSE_AUDIO_CORRECT:
        updates.push({
          taskKey: DailyChallengeTaskKey.TRUE_FALSE_AUDIO_CORRECT,
          value,
        });

        break;

      case LearningActivityType.XP_EARNED:
        updates.push(
          {
            taskKey: DailyChallengeTaskKey.EARN_XP_50,
            value,
          },
          {
            taskKey: DailyChallengeTaskKey.EARN_XP_100,
            value,
          },
        );

        break;

      case LearningActivityType.AUDIO_TRACK_LISTENED:
        if (metadata.scope === 'practice_hub') {
          updates.push({
            taskKey: DailyChallengeTaskKey.LISTEN_TRACKS_HUB,
            value,
          });
        } else {
          updates.push({
            taskKey: DailyChallengeTaskKey.LISTEN_AUDIO_TRACKS,
            value,
          });
        }

        break;

      case LearningActivityType.LESSON_THEORY_READ:
        updates.push({
          taskKey: DailyChallengeTaskKey.READ_THEORY_PAGE,
          value: 1,
        });

        break;

      case LearningActivityType.LESSON_VIDEO_WATCHED:
        updates.push({
          taskKey: DailyChallengeTaskKey.WATCH_VIDEO_80,
          value: 100,
        });

        break;

      case LearningActivityType.LESSON_COMPLETED:
        updates.push({
          taskKey: DailyChallengeTaskKey.ACTIVE_LEARNING_MINUTES,
          value: 1,
        });

        break;

      case LearningActivityType.IMPORTANT_VERB_REVIEWED:
        updates.push({
          taskKey: DailyChallengeTaskKey.REVIEW_IMPORTANT_VERB,
          value,
        });

        if (metadata.firstReview === true) {
          updates.push({
            taskKey: DailyChallengeTaskKey.LEARN_VERBS,
            value: 1,
          });
        }

        break;

      case LearningActivityType.ACTIVE_LEARNING_MINUTES:
        updates.push({
          taskKey: DailyChallengeTaskKey.ACTIVE_LEARNING_MINUTES,
          value,
        });

        break;

      case LearningActivityType.FINAL_EXAM_SUBMITTED:
      case LearningActivityType.SURVIVAL_ITALIAN_COMPLETED:
      case LearningActivityType.JOB_SENTENCE_REVIEWED:
        updates.push({
          taskKey: DailyChallengeTaskKey.ACTIVE_LEARNING_MINUTES,
          value,
        });

        break;

      default:
        break;
    }

    return updates;
  }

  private async canRewardStreakFreeze(userId: string) {
    const streak = await this.streakService.getUserStreak(userId);

    if (streak.streakFreezeCount > 0) {
      return false;
    }

    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const recentFreezeReward = await this.chestRewardRepository.findOne({
      where: {
        userId,
        streakFreezeCount: MoreThanOrEqual(1),
        openedAt: MoreThanOrEqual(twoMonthsAgo),
      },
    });

    return !recentFreezeReward;
  }

  private getRewardType(
    xpAmount: number,
    streakFreezeAwarded: boolean,
  ): DailyChestRewardType {
    if (xpAmount > 0 && streakFreezeAwarded) {
      return DailyChestRewardType.XP_AND_STREAK_FREEZE;
    }

    if (streakFreezeAwarded) {
      return DailyChestRewardType.STREAK_FREEZE;
    }

    return DailyChestRewardType.XP;
  }

  private pickVariation(challengeDate: string) {
    const hash = [...challengeDate].reduce(
      (sum, character) => sum + character.charCodeAt(0),
      0,
    );

    return DAILY_CHALLENGE_VARIATIONS[hash % DAILY_CHALLENGE_VARIATIONS.length];
  }

  private getRandomXpReward() {
    const min = 10;
    const max = 200;
    const step = 5;
    const possibleSteps = (max - min) / step + 1;

    return Math.floor(Math.random() * possibleSteps) * step + min;
  }

  private rollPercent(percent: number) {
    return Math.random() * 100 < percent;
  }

  private sortProgress(items: UserDailyChallengeProgress[]) {
    return [...items].sort((first, second) => {
      if (first.createdAt.getTime() === second.createdAt.getTime()) {
        return first.taskKey.localeCompare(second.taskKey);
      }

      return first.createdAt.getTime() - second.createdAt.getTime();
    });
  }

  private resolveChallengeDate(date?: string) {
    const dateOnly = date?.slice(0, 10);

    if (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      return dateOnly;
    }

    return new Date().toISOString().slice(0, 10);
  }
}
