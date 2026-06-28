import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RecordLearningTimeDto } from '../dto/learning-activity.dto';
import { UserLearningActivityTimeEntry } from '../entities/user-learning-activity-time-entry.entity';

@Injectable()
export class LearningActivityService {
  constructor(
    @InjectRepository(UserLearningActivityTimeEntry)
    private readonly activityRepository: Repository<UserLearningActivityTimeEntry>,
  ) {}

  async recordTime(userId: string, dto: RecordLearningTimeDto) {
    const existing = await this.activityRepository.findOne({
      where: { userId, eventId: dto.eventId },
    });

    if (existing) {
      return { recorded: false, entry: existing };
    }

    const startedAt = new Date(dto.startedAt);
    const endedAt = new Date(dto.endedAt);
    const elapsedSeconds = Math.floor(
      (endedAt.getTime() - startedAt.getTime()) / 1000,
    );

    if (elapsedSeconds <= 0) {
      throw new BadRequestException('endedAt must be after startedAt');
    }

    // Limit client-reported time to the measured interval and one hour per event.
    const durationSeconds = Math.min(
      dto.durationSeconds,
      elapsedSeconds + 5,
      3600,
    );

    if (durationSeconds <= 0) {
      throw new BadRequestException('Learning duration must be positive');
    }

    const activityDate =
      dto.clientActivityDate ?? startedAt.toISOString().slice(0, 10);

    const entry = this.activityRepository.create({
      eventId: dto.eventId,
      userId,
      activityDate,
      activityType: dto.activityType,
      sourceId: dto.sourceId?.trim() || null,
      durationSeconds,
      startedAt,
      endedAt,
    });

    try {
      const saved = await this.activityRepository.save(entry);
      return { recorded: true, entry: saved };
    } catch (error) {
      const duplicate = await this.activityRepository.findOne({
        where: { userId, eventId: dto.eventId },
      });

      if (duplicate) {
        return { recorded: false, entry: duplicate };
      }

      throw error;
    }
  }

  async getWeeklySummary(userId: string, requestedWeekStart?: string) {
    const weekStart = requestedWeekStart
      ? this.parseDateOnly(requestedWeekStart)
      : this.startOfCurrentUtcWeek();
    const weekEnd = this.addDays(weekStart, 6);
    const startDate = this.toDateOnly(weekStart);
    const endDate = this.toDateOnly(weekEnd);

    const rows = await this.activityRepository
      .createQueryBuilder('activity')
      .select('activity.activityDate', 'activityDate')
      .addSelect('SUM(activity.durationSeconds)', 'durationSeconds')
      .where('activity.userId = :userId', { userId })
      .andWhere('activity.activityDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('activity.activityDate')
      .orderBy('activity.activityDate', 'ASC')
      .getRawMany<{ activityDate: string; durationSeconds: string }>();

    const secondsByDate = new Map<string, number>(
      rows.map((row) => [row.activityDate, Number(row.durationSeconds) || 0]),
    );

    const days = Array.from({ length: 7 }, (_, index) => {
      const date = this.addDays(weekStart, index);
      const dateKey = this.toDateOnly(date);
      return {
        date: dateKey,
        dayLabel: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][index],
        durationSeconds: secondsByDate.get(dateKey) ?? 0,
      };
    });

    return {
      weekStart: startDate,
      weekEnd: endDate,
      totalSeconds: days.reduce((total, day) => total + day.durationSeconds, 0),
      days,
    };
  }

  private startOfCurrentUtcWeek(): Date {
    const now = new Date();
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - daysSinceMonday);
    return date;
  }

  private parseDateOnly(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid weekStart date');
    }
    return date;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private toDateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
