import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  NotificationPriority,
  NotificationType,
} from 'src/notifications/entities/notification-event.entity';
import { NotificationsService } from 'src/notifications/services/notifications.service';
import { LeaderboardRewardNotification } from '../entities/leaderboard-reward-notification.entity';
import {
  LeaderboardRewardNotificationStatus,
  LeaderboardRewardNotificationType,
} from '../types/leaderboard.type';

interface QueueLeaderboardRewardNotificationParams {
  rewardId: string;
  userId: string;
  type: LeaderboardRewardNotificationType;
  title: string;
  body: string;
  deepLink?: string | null;
  imageFileId?: string | null;
  priority?: NotificationPriority;
}

@Injectable()
export class LeaderboardRewardNotificationService {
  private readonly logger = new Logger(
    LeaderboardRewardNotificationService.name,
  );

  constructor(
    @InjectRepository(LeaderboardRewardNotification)
    private readonly notificationRepository: Repository<LeaderboardRewardNotification>,

    private readonly notificationsService: NotificationsService,
  ) {}

  async queue(
    params: QueueLeaderboardRewardNotificationParams,
  ): Promise<LeaderboardRewardNotification> {
    let notification = this.notificationRepository.create({
      rewardId: params.rewardId,
      userId: params.userId,
      type: params.type,
      status: LeaderboardRewardNotificationStatus.QUEUED,
      title: params.title.trim().slice(0, 180),
      body: params.body.trim().slice(0, 1000),
      sentAt: null,
      errorMessage: null,
    });

    notification = await this.notificationRepository.save(notification);

    try {
      /*
       * This uses the application's existing notification
       * infrastructure:
       *
       * - notification_events
       * - user_notifications
       * - notification_deliveries
       * - Firebase FCM
       */
      await this.notificationsService.createSystemNotificationForUser({
        userId: params.userId,

        /*
         * SYSTEM can be used without changing your existing
         * PostgreSQL NotificationType enum.
         */
        type: NotificationType.SYSTEM,

        title: params.title.trim().slice(0, 180),

        /*
         * NotificationEvent.body supports 500 characters.
         */
        body: params.body.trim().slice(0, 500),

        deepLink: params.deepLink?.trim() || `/rewards/${params.rewardId}`,

        imageFileId: params.imageFileId ?? null,

        priority: params.priority ?? NotificationPriority.HIGH,
      });

      notification.status = LeaderboardRewardNotificationStatus.SENT;

      notification.sentAt = new Date();
      notification.errorMessage = null;

      return this.notificationRepository.save(notification);
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);

      this.logger.error(
        `Failed to send reward notification ${notification.id}: ${errorMessage}`,
      );

      notification.status = LeaderboardRewardNotificationStatus.FAILED;

      notification.sentAt = null;

      notification.errorMessage = errorMessage.slice(0, 1000);

      /*
       * Do not throw here.
       *
       * A temporary FCM failure should not roll back the
       * actual reward. The admin can resend the notification.
       */
      return this.notificationRepository.save(notification);
    }
  }

  async markSent(
    notificationId: string,
  ): Promise<LeaderboardRewardNotification | null> {
    const notification = await this.notificationRepository.findOne({
      where: {
        id: notificationId,
      },
    });

    if (!notification) {
      return null;
    }

    notification.status = LeaderboardRewardNotificationStatus.SENT;

    notification.sentAt = new Date();
    notification.errorMessage = null;

    return this.notificationRepository.save(notification);
  }

  async markFailed(
    notificationId: string,
    errorMessage: string,
  ): Promise<LeaderboardRewardNotification | null> {
    const notification = await this.notificationRepository.findOne({
      where: {
        id: notificationId,
      },
    });

    if (!notification) {
      return null;
    }

    notification.status = LeaderboardRewardNotificationStatus.FAILED;

    notification.sentAt = null;

    notification.errorMessage = errorMessage.slice(0, 1000);

    return this.notificationRepository.save(notification);
  }

  async findLatestForReward(
    rewardId: string,
  ): Promise<LeaderboardRewardNotification[]> {
    return this.notificationRepository.find({
      where: {
        rewardId,
      },
      order: {
        createdAt: 'DESC',
      },
      take: 10,
    });
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    return 'Unknown notification error';
  }
}
