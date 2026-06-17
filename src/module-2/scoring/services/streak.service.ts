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

  async getUserStreak(userId: string) {
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

    return streak;
  }

  async getUserStreakSummary(userId: string): Promise<UserStreakSummary> {
    const streak = await this.getUserStreak(userId);

    return {
      currentDays: streak.currentDays,
      longestDays: streak.longestDays,
      lastActivityDate: streak.lastActivityDate,
      isUpdatedToday: streak.lastActivityDate === this.resolveActivityDate(),
    };
  }

  async updateDailyStreak(
    userId: string,
    activityDate?: string,
    activityAt = new Date(),
  ): Promise<UserStreakSummary> {
    const resolvedActivityDate = this.resolveActivityDate(activityDate);
    const streak = await this.getUserStreak(userId);

    if (streak.lastActivityDate === resolvedActivityDate) {
      streak.lastActivityAt = activityAt;

      const savedStreak = await this.userStreakRepository.save(streak);

      return {
        currentDays: savedStreak.currentDays,
        longestDays: savedStreak.longestDays,
        lastActivityDate: savedStreak.lastActivityDate,
        isUpdatedToday: true,
      };
    }

    if (!streak.lastActivityDate) {
      streak.currentDays = 1;
      streak.longestDays = Math.max(streak.longestDays, 1);
      streak.lastActivityDate = resolvedActivityDate;
      streak.lastActivityAt = activityAt;

      const savedStreak = await this.userStreakRepository.save(streak);

      return {
        currentDays: savedStreak.currentDays,
        longestDays: savedStreak.longestDays,
        lastActivityDate: savedStreak.lastActivityDate,
        isUpdatedToday: true,
      };
    }

    const lastDate = this.parseDate(streak.lastActivityDate);
    const currentDate = this.parseDate(resolvedActivityDate);
    const diffDays = this.diffDays(lastDate, currentDate);

    if (diffDays === 1) {
      streak.currentDays += 1;
    } else if (diffDays > 1) {
      if (streak.streakFreezeCount > 0 && diffDays === 2) {
        streak.streakFreezeCount -= 1;
        streak.currentDays += 1;
      } else {
        streak.currentDays = 1;
      }
    }

    streak.longestDays = Math.max(streak.longestDays, streak.currentDays);
    streak.lastActivityDate = resolvedActivityDate;
    streak.lastActivityAt = activityAt;

    const savedStreak = await this.userStreakRepository.save(streak);

    return {
      currentDays: savedStreak.currentDays,
      longestDays: savedStreak.longestDays,
      lastActivityDate: savedStreak.lastActivityDate,
      isUpdatedToday: true,
    };
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
