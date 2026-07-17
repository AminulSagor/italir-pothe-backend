import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { StoreSubscription } from 'src/billing/google-play-subscriptions/entities/store-subscription.entity';
import { StoreSubscriptionStatus } from 'src/billing/types/google-play-subscription.type';
import { StoreOrderPackageSnapshot } from 'src/package-store/entities/store-order-package-snapshot.entity';
import {
  StorePackageType,
  StreakProtectionMode,
} from 'src/package-store/types/package-store.type';

import { UserStreak } from '../entities/user-streak.entity';

export interface UserStreakSummary {
  currentDays: number;
  longestDays: number;
  lastActivityDate: string | null;
  isUpdatedToday: boolean;
}

interface MonthlyProtectionPeriod {
  startsAt: Date;
  endsAt: Date;
}

@Injectable()
export class StreakService {
  constructor(
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,

    @InjectRepository(StoreSubscription)
    private readonly subscriptionRepository: Repository<StoreSubscription>,
  ) {}

  async getUserStreak(
    userId: string,
    currentDate?: string,
  ): Promise<UserStreak> {
    let streak = await this.userStreakRepository.findOne({
      where: { userId },
    });

    if (!streak) {
      streak = await this.userStreakRepository.save(
        this.userStreakRepository.create({
          userId,
          currentDays: 0,
          longestDays: 0,
          lastActivityDate: null,
          lastActivityAt: null,
          streakFreezeCount: 0,
        }),
      );
    }

    return this.resetExpiredStreakIfNeeded(
      streak,
      this.resolveActivityDate(currentDate),
    );
  }

  async getUserStreakSummary(
    userId: string,
    currentDate?: string,
  ): Promise<UserStreakSummary> {
    const resolvedDate = this.resolveActivityDate(currentDate);
    const streak = await this.getUserStreak(userId, resolvedDate);

    return {
      currentDays: streak.currentDays,
      longestDays: streak.longestDays,
      lastActivityDate: streak.lastActivityDate,
      isUpdatedToday: streak.lastActivityDate === resolvedDate,
    };
  }

  async updateDailyStreak(
    userId: string,
    activityDate?: string,
    activityAt = new Date(),
  ): Promise<UserStreakSummary> {
    const resolvedActivityDate = this.resolveActivityDate(activityDate);

    const streak = await this.getUserStreak(userId, resolvedActivityDate);

    if (streak.lastActivityDate === resolvedActivityDate) {
      streak.lastActivityAt = activityAt;

      const savedStreak = await this.userStreakRepository.save(streak);

      return this.toSummary(savedStreak, resolvedActivityDate);
    }

    if (!streak.lastActivityDate) {
      streak.currentDays = 1;
      streak.longestDays = Math.max(streak.longestDays, 1);
      streak.lastActivityDate = resolvedActivityDate;
      streak.lastActivityAt = activityAt;

      const savedStreak = await this.userStreakRepository.save(streak);

      return this.toSummary(savedStreak, resolvedActivityDate);
    }

    const lastDate = this.parseDate(streak.lastActivityDate);

    const currentDate = this.parseDate(resolvedActivityDate);

    const diffDays = this.diffDays(lastDate, currentDate);

    if (diffDays < 0) {
      return this.toSummary(streak, resolvedActivityDate);
    }

    if (diffDays === 1) {
      streak.currentDays += 1;
    } else {
      streak.currentDays = 1;
    }

    streak.longestDays = Math.max(streak.longestDays, streak.currentDays);

    streak.lastActivityDate = resolvedActivityDate;

    streak.lastActivityAt = activityAt;

    const savedStreak = await this.userStreakRepository.save(streak);

    return this.toSummary(savedStreak, resolvedActivityDate);
  }

  async addStreakFreeze(userId: string, count = 1) {
    const streak = await this.getUserStreak(userId);

    streak.streakFreezeCount += count;

    return this.userStreakRepository.save(streak);
  }

  async useStreakFreeze(userId: string) {
    const streak = await this.getUserStreak(userId);

    if (streak.streakFreezeCount <= 0) {
      return streak;
    }

    streak.streakFreezeCount -= 1;

    return this.userStreakRepository.save(streak);
  }

  private async resetExpiredStreakIfNeeded(
    streak: UserStreak,
    currentDate: string,
  ): Promise<UserStreak> {
    if (!streak.lastActivityDate || streak.currentDays <= 0) {
      return streak;
    }

    const lastDate = this.parseDate(streak.lastActivityDate);

    const today = this.parseDate(currentDate);

    const diffDays = this.diffDays(lastDate, today);

    if (diffDays <= 1) {
      return streak;
    }

    const missedDays = diffDays - 1;

    const firstMissedDate = this.addDays(lastDate, 1);

    const lastMissedDate = this.addDays(today, -1);

    const monthlyPeriods = await this.findMonthlyProtectionPeriods(
      streak.userId,
      firstMissedDate,
      lastMissedDate,
    );

    for (
      let missedDayIndex = 0;
      missedDayIndex < missedDays;
      missedDayIndex += 1
    ) {
      const missedDate = this.addDays(firstMissedDate, missedDayIndex);

      const protectedByMonthlyPlan = this.isDateProtectedByMonthlyPlan(
        missedDate,
        monthlyPeriods,
      );

      if (!protectedByMonthlyPlan) {
        if (streak.streakFreezeCount <= 0) {
          streak.currentDays = 0;
          streak.lastActivityDate = null;
          streak.lastActivityAt = null;

          return this.userStreakRepository.save(streak);
        }

        // Finite freezes are consumed only when monthly
        // protection does not cover the missed date.
        streak.streakFreezeCount -= 1;
      }

      streak.currentDays += 1;

      streak.longestDays = Math.max(streak.longestDays, streak.currentDays);

      streak.lastActivityDate = this.formatDate(missedDate);

      streak.lastActivityAt = missedDate;
    }

    return this.userStreakRepository.save(streak);
  }

  private async findMonthlyProtectionPeriods(
    userId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<MonthlyProtectionPeriod[]> {
    const rangeEndExclusive = this.addDays(rangeEnd, 1);

    const subscriptions = await this.subscriptionRepository
      .createQueryBuilder('subscription')
      .innerJoin(
        StoreOrderPackageSnapshot,
        'snapshot',
        'snapshot.orderId = subscription.initialOrderId',
      )
      .where('subscription.userId = :userId', {
        userId,
      })
      .andWhere('snapshot.packageType = :packageType', {
        packageType: StorePackageType.STREAK_FREEZE,
      })
      .andWhere('snapshot.streakProtectionMode = :protectionMode', {
        protectionMode: StreakProtectionMode.MONTHLY_UNLIMITED,
      })
      .andWhere('subscription.expiresAt IS NOT NULL')
      .andWhere(
        `COALESCE(
            subscription.startedAt,
            subscription.createdAt
          ) < :rangeEndExclusive`,
        {
          rangeEndExclusive,
        },
      )
      .andWhere('subscription.expiresAt > :rangeStart', {
        rangeStart,
      })
      .andWhere('subscription.status NOT IN (:...excludedStatuses)', {
        excludedStatuses: [
          StoreSubscriptionStatus.PENDING,
          StoreSubscriptionStatus.PENDING_PURCHASE_CANCELED,
          StoreSubscriptionStatus.UNKNOWN,
        ],
      })
      .getMany();

    const periods: MonthlyProtectionPeriod[] = [];

    for (const subscription of subscriptions) {
      const startsAt = subscription.startedAt ?? subscription.createdAt;

      let endsAt = subscription.expiresAt;

      if (!endsAt) {
        continue;
      }

      /*
       * Revocation removes protection from the
       * revocation time onward.
       */
      if (subscription.revokedAt && subscription.revokedAt < endsAt) {
        endsAt = subscription.revokedAt;
      }

      /*
       * ON_HOLD and PAUSED suspend entitlement.
       * lastEventTime represents when that latest
       * suspension state was received.
       */
      if (
        (subscription.status === StoreSubscriptionStatus.ON_HOLD ||
          subscription.status === StoreSubscriptionStatus.PAUSED) &&
        subscription.lastEventTime &&
        subscription.lastEventTime < endsAt
      ) {
        endsAt = subscription.lastEventTime;
      }

      if (endsAt <= startsAt) {
        continue;
      }

      periods.push({
        startsAt,
        endsAt,
      });
    }

    return periods;
  }

  private isDateProtectedByMonthlyPlan(
    missedDate: Date,
    periods: MonthlyProtectionPeriod[],
  ): boolean {
    const dayStart = missedDate;

    const dayEndExclusive = this.addDays(missedDate, 1);

    return periods.some(
      (period) => period.startsAt < dayEndExclusive && period.endsAt > dayStart,
    );
  }

  private addDays(date: Date, days: number): Date {
    const nextDate = new Date(date);

    nextDate.setUTCDate(nextDate.getUTCDate() + days);

    return nextDate;
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private toSummary(
    streak: UserStreak,
    currentDate: string,
  ): UserStreakSummary {
    return {
      currentDays: streak.currentDays,
      longestDays: streak.longestDays,
      lastActivityDate: streak.lastActivityDate,
      isUpdatedToday: streak.lastActivityDate === currentDate,
    };
  }

  private resolveActivityDate(activityDate?: string): string {
    if (activityDate && /^\d{4}-\d{2}-\d{2}$/.test(activityDate)) {
      return activityDate;
    }

    return new Date().toISOString().slice(0, 10);
  }

  private parseDate(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
  }

  private diffDays(first: Date, second: Date): number {
    const oneDayMs = 24 * 60 * 60 * 1000;

    return Math.round((second.getTime() - first.getTime()) / oneDayMs);
  }
}
