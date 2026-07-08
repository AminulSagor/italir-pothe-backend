import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserStreak } from '../entities/user-streak.entity';

export interface UserStreakSummary {
  currentDays: number;
  longestDays: number;
  lastActivityDate: string | null;
  isUpdatedToday: boolean;
}

@Injectable()
export class StreakService {
  constructor(
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,
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

    if (streak.streakFreezeCount > 0) {
      const freezeDaysToUse = Math.min(streak.streakFreezeCount, missedDays);

      streak.currentDays += freezeDaysToUse;
      streak.streakFreezeCount -= freezeDaysToUse;

      const protectedDate = this.addDays(lastDate, freezeDaysToUse);

      streak.lastActivityDate = this.formatDate(protectedDate);
      streak.lastActivityAt = protectedDate;

      const remainingMissedDays = missedDays - freezeDaysToUse;

      if (remainingMissedDays <= 0) {
        return this.userStreakRepository.save(streak);
      }
    }

    streak.currentDays = 0;
    streak.lastActivityDate = null;
    streak.lastActivityAt = null;

    return this.userStreakRepository.save(streak);
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

  private resolveActivityDate(activityDate?: string) {
    if (activityDate && /^\d{4}-\d{2}-\d{2}$/.test(activityDate)) {
      return activityDate;
    }

    return new Date().toISOString().slice(0, 10);
  }

  private parseDate(date: string) {
    return new Date(`${date}T00:00:00.000Z`);
  }

  private diffDays(first: Date, second: Date) {
    const oneDayMs = 24 * 60 * 60 * 1000;

    return Math.round((second.getTime() - first.getTime()) / oneDayMs);
  }
}
