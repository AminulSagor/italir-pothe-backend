import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

import { UserDeviceService } from 'src/devices/services/user-device.service';
import { UserStreak } from 'src/module-2/scoring/entities/user-streak.entity';

import {
  NotificationPriority,
  NotificationType,
} from '../entities/notification-event.entity';
import {
  StreakReminderType,
  UserStreakReminder,
} from '../entities/user-streak-reminder.entity';
import { NotificationsService } from './notifications.service';

interface ReminderRule {
  type: StreakReminderType;
  thresholdSeconds: number;
  title: string;
  body: string;
}

@Injectable()
export class StreakReminderService {
  private readonly logger = new Logger(StreakReminderService.name);

  private readonly reminderWindowSeconds = 15 * 60;

  private readonly reminderRules: ReminderRule[] = [
    {
      type: StreakReminderType.TEN_HOURS,
      thresholdSeconds: 10 * 60 * 60,
      title: 'Keep your streak alive!',
      body: 'Only 10 hours left to complete today’s learning activity.',
    },
    {
      type: StreakReminderType.SIX_HOURS,
      thresholdSeconds: 6 * 60 * 60,
      title: 'Your streak needs you',
      body: 'Only 6 hours left. Complete one activity to protect your streak.',
    },
    {
      type: StreakReminderType.THREE_HOURS,
      thresholdSeconds: 3 * 60 * 60,
      title: 'Streak reminder',
      body: 'Only 3 hours left before your daily streak resets.',
    },
    {
      type: StreakReminderType.ONE_HOUR,
      thresholdSeconds: 60 * 60,
      title: 'One hour left!',
      body: 'Complete a quick lesson, quiz, or vocabulary activity to keep your streak.',
    },
    {
      type: StreakReminderType.THIRTY_MINUTES,
      thresholdSeconds: 30 * 60,
      title: 'Final streak warning',
      body: 'Only 30 minutes left. Complete one activity now to save your streak.',
    },
  ];

  constructor(
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,

    @InjectRepository(UserStreakReminder)
    private readonly userStreakReminderRepository: Repository<UserStreakReminder>,

    private readonly userDeviceService: UserDeviceService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sendStreakReminderNotifications(): Promise<void> {
    const activeDevices =
      await this.userDeviceService.findAllActiveFcmDevices();

    if (activeDevices.length === 0) {
      return;
    }

    const latestDeviceByUser = new Map<
      string,
      {
        userId: string;
        timezone: string | null;
      }
    >();

    for (const device of activeDevices) {
      if (!latestDeviceByUser.has(device.userId)) {
        latestDeviceByUser.set(device.userId, {
          userId: device.userId,
          timezone: device.timezone,
        });
      }
    }

    const userIds = Array.from(latestDeviceByUser.keys());

    if (userIds.length === 0) {
      return;
    }

    const streaks = await this.userStreakRepository.find({
      where: {
        userId: Not('00000000-0000-0000-0000-000000000000'),
      },
    });

    const streakByUserId = new Map(streaks.map((item) => [item.userId, item]));

    for (const userId of userIds) {
      const deviceInfo = latestDeviceByUser.get(userId);

      const streak = streakByUserId.get(userId);

      if (!deviceInfo || !streak) {
        continue;
      }

      await this.processUserReminder({
        userId,
        timezone: deviceInfo.timezone || 'UTC',
        streak,
      });
    }
  }

  private async processUserReminder(params: {
    userId: string;
    timezone: string;
    streak: UserStreak;
  }): Promise<void> {
    const localToday = this.getLocalDateString(new Date(), params.timezone);

    if (!params.streak.lastActivityDate) {
      return;
    }

    if (params.streak.lastActivityDate === localToday) {
      return;
    }

    const daysSinceLastActivity = this.diffLocalDateDays(
      params.streak.lastActivityDate,
      localToday,
    );

    if (daysSinceLastActivity !== 1) {
      return;
    }

    const secondsLeft = this.getSecondsUntilLocalMidnight(params.timezone);

    const rule = this.findReminderRule(secondsLeft);

    if (!rule) {
      return;
    }

    const alreadySent = await this.userStreakReminderRepository.findOne({
      where: {
        userId: params.userId,
        reminderDate: localToday,
        reminderType: rule.type,
      },
    });

    if (alreadySent) {
      return;
    }

    await this.notificationsService.createSystemNotificationForUser({
      userId: params.userId,
      type: NotificationType.STREAK_REMINDER,
      title: rule.title,
      body: rule.body,
      deepLink: '/daily-challenges',
      priority: NotificationPriority.HIGH,
    });

    await this.userStreakReminderRepository.save(
      this.userStreakReminderRepository.create({
        userId: params.userId,
        reminderDate: localToday,
        reminderType: rule.type,
        sentAt: new Date(),
      }),
    );

    this.logger.log(
      `Sent ${rule.type} streak reminder to user ${params.userId}`,
    );
  }

  private findReminderRule(secondsLeft: number): ReminderRule | undefined {
    return this.reminderRules.find((rule) => {
      const lowerBound = rule.thresholdSeconds - this.reminderWindowSeconds;

      return secondsLeft <= rule.thresholdSeconds && secondsLeft > lowerBound;
    });
  }

  private getSecondsUntilLocalMidnight(timezone: string): number {
    const localParts = this.getLocalDateTimeParts(new Date(), timezone);

    const secondsPassedToday =
      localParts.hour * 60 * 60 + localParts.minute * 60 + localParts.second;

    return 24 * 60 * 60 - secondsPassedToday;
  }

  private getLocalDateString(date: Date, timezone: string): string {
    const parts = this.getLocalDateTimeParts(date, timezone);

    return `${parts.year}-${this.pad(parts.month)}-${this.pad(parts.day)}`;
  }

  private getLocalDateTimeParts(date: Date, timezone: string) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });

    const parts = formatter.formatToParts(date);

    const valueMap = new Map(parts.map((item) => [item.type, item.value]));

    return {
      year: Number(valueMap.get('year')),
      month: Number(valueMap.get('month')),
      day: Number(valueMap.get('day')),
      hour: Number(valueMap.get('hour')),
      minute: Number(valueMap.get('minute')),
      second: Number(valueMap.get('second')),
    };
  }

  private diffLocalDateDays(firstDate: string, secondDate: string): number {
    const first = new Date(`${firstDate}T00:00:00.000Z`);

    const second = new Date(`${secondDate}T00:00:00.000Z`);

    const oneDayMs = 24 * 60 * 60 * 1000;

    return Math.round((second.getTime() - first.getTime()) / oneDayMs);
  }

  private pad(value: number): string {
    return value.toString().padStart(2, '0');
  }
}
