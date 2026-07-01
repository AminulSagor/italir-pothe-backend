import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RecordLearningTimeDto } from '../dto/learning-activity.dto';
import { UserLearningActivityTimeEntry } from '../entities/user-learning-activity-time-entry.entity';

export interface LearningActivityAnalyticsDay {
  date: string;
  durationSeconds: number;
  durationMinutes: number;
  isActive: boolean;
}

export interface LearningActivityAnalyticsTypeBreakdown {
  activityType: string;
  durationSeconds: number;
  durationMinutes: number;
  percentage: number;
}

export interface LearningActivityAnalytics {
  days: number;
  startDate: string;
  endDate: string;

  totalSeconds: number;
  totalHours: number;

  rangeTotalSeconds: number;
  rangeTotalHours: number;

  activeDays: number;
  averageMinutesPerActiveDay: number;
  maxDailyDurationSeconds: number;

  daily: LearningActivityAnalyticsDay[];

  activityTypeBreakdown: LearningActivityAnalyticsTypeBreakdown[];
}

@Injectable()
export class LearningActivityService {
  constructor(
    @InjectRepository(UserLearningActivityTimeEntry)
    private readonly activityRepository: Repository<UserLearningActivityTimeEntry>,
  ) {}

  async recordTime(userId: string, dto: RecordLearningTimeDto) {
    const existing = await this.activityRepository.findOne({
      where: {
        userId,
        eventId: dto.eventId,
      },
    });

    if (existing) {
      return {
        recorded: false,
        entry: existing,
      };
    }

    const startedAt = new Date(dto.startedAt);
    const endedAt = new Date(dto.endedAt);

    const elapsedSeconds = Math.floor(
      (endedAt.getTime() - startedAt.getTime()) / 1000,
    );

    if (elapsedSeconds <= 0) {
      throw new BadRequestException('endedAt must be after startedAt');
    }

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

      return {
        recorded: true,
        entry: saved,
      };
    } catch (error) {
      const duplicate = await this.activityRepository.findOne({
        where: {
          userId,
          eventId: dto.eventId,
        },
      });

      if (duplicate) {
        return {
          recorded: false,
          entry: duplicate,
        };
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
      .where('activity.userId = :userId', {
        userId,
      })
      .andWhere('activity.activityDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('activity.activityDate')
      .orderBy('activity.activityDate', 'ASC')
      .getRawMany<{
        activityDate: string;
        durationSeconds: string;
      }>();

    const secondsByDate = new Map<string, number>(
      rows.map((row) => [row.activityDate, Number(row.durationSeconds) || 0]),
    );

    const days = Array.from(
      {
        length: 7,
      },
      (_, index) => {
        const date = this.addDays(weekStart, index);
        const dateKey = this.toDateOnly(date);

        return {
          date: dateKey,
          dayLabel: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][index],
          durationSeconds: secondsByDate.get(dateKey) ?? 0,
        };
      },
    );

    return {
      weekStart: startDate,
      weekEnd: endDate,

      totalSeconds: days.reduce((total, day) => total + day.durationSeconds, 0),

      days,
    };
  }

  async getUserActivityAnalytics(
    userId: string,
    requestedDays = 30,
  ): Promise<LearningActivityAnalytics> {
    const days = Math.min(365, Math.max(7, requestedDays));

    const end = this.startOfUtcDay(new Date());
    const start = this.addDays(end, -(days - 1));

    const startDate = this.toDateOnly(start);
    const endDate = this.toDateOnly(end);

    const [dailyRows, typeRows, lifetimeTotalRow] = await Promise.all([
      this.activityRepository
        .createQueryBuilder('activity')
        .select('activity.activityDate', 'activityDate')
        .addSelect('SUM(activity.durationSeconds)', 'durationSeconds')
        .where('activity.userId = :userId', {
          userId,
        })
        .andWhere('activity.activityDate BETWEEN :startDate AND :endDate', {
          startDate,
          endDate,
        })
        .groupBy('activity.activityDate')
        .orderBy('activity.activityDate', 'ASC')
        .getRawMany<{
          activityDate: string;
          durationSeconds: string;
        }>(),

      this.activityRepository
        .createQueryBuilder('activity')
        .select('activity.activityType', 'activityType')
        .addSelect('SUM(activity.durationSeconds)', 'durationSeconds')
        .where('activity.userId = :userId', {
          userId,
        })
        .andWhere('activity.activityDate BETWEEN :startDate AND :endDate', {
          startDate,
          endDate,
        })
        .groupBy('activity.activityType')
        .orderBy('SUM(activity.durationSeconds)', 'DESC')
        .getRawMany<{
          activityType: string;
          durationSeconds: string;
        }>(),

      this.activityRepository
        .createQueryBuilder('activity')
        .select('COALESCE(SUM(activity.durationSeconds), 0)', 'totalSeconds')
        .where('activity.userId = :userId', {
          userId,
        })
        .getRawOne<{
          totalSeconds: string;
        }>(),
    ]);

    const secondsByDate = new Map<string, number>(
      dailyRows.map((row) => [
        row.activityDate,
        Number(row.durationSeconds) || 0,
      ]),
    );

    const daily: LearningActivityAnalyticsDay[] = Array.from(
      {
        length: days,
      },
      (_, index) => {
        const date = this.addDays(start, index);
        const dateKey = this.toDateOnly(date);

        const durationSeconds = secondsByDate.get(dateKey) ?? 0;

        return {
          date: dateKey,
          durationSeconds,
          durationMinutes: Number((durationSeconds / 60).toFixed(1)),
          isActive: durationSeconds > 0,
        };
      },
    );

    const rangeTotalSeconds = daily.reduce(
      (total, item) => total + item.durationSeconds,
      0,
    );

    const totalSeconds = Number(lifetimeTotalRow?.totalSeconds ?? 0);

    const activeDays = daily.filter((item) => item.isActive).length;

    const maxDailyDurationSeconds = daily.reduce(
      (maximum, item) => Math.max(maximum, item.durationSeconds),
      0,
    );

    const activityTypeBreakdown =
      typeRows.map<LearningActivityAnalyticsTypeBreakdown>((row) => {
        const durationSeconds = Number(row.durationSeconds) || 0;

        return {
          activityType: row.activityType,
          durationSeconds,
          durationMinutes: Number((durationSeconds / 60).toFixed(1)),

          percentage:
            rangeTotalSeconds > 0
              ? Number(((durationSeconds / rangeTotalSeconds) * 100).toFixed(2))
              : 0,
        };
      });

    return {
      days,
      startDate,
      endDate,

      totalSeconds,
      totalHours: Number((totalSeconds / 3600).toFixed(1)),

      rangeTotalSeconds,
      rangeTotalHours: Number((rangeTotalSeconds / 3600).toFixed(1)),

      activeDays,

      averageMinutesPerActiveDay:
        activeDays > 0
          ? Number((rangeTotalSeconds / 60 / activeDays).toFixed(1))
          : 0,

      maxDailyDurationSeconds,

      daily,

      activityTypeBreakdown,
    };
  }

  private startOfCurrentUtcWeek(): Date {
    const date = this.startOfUtcDay(new Date());

    const daysSinceMonday = (date.getUTCDay() + 6) % 7;

    date.setUTCDate(date.getUTCDate() - daysSinceMonday);

    return date;
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
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
