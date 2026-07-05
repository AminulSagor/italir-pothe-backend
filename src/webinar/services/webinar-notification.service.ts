import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  NotificationEvent,
  NotificationPriority,
  NotificationType,
} from 'src/notifications/entities/notification-event.entity';
import { NotificationsService } from 'src/notifications/services/notifications.service';
import { Webinar, WebinarStatus } from '../entities/webinar.entity';
import { WebinarAudienceService } from './webinar-audience.service';

type WebinarNotificationKind = 'scheduled' | 'reminder' | 'started';

@Injectable()
export class WebinarNotificationService {
  private readonly logger = new Logger(WebinarNotificationService.name);
  private isProcessingReminders = false;

  constructor(
    @InjectRepository(Webinar)
    private readonly webinarRepository: Repository<Webinar>,

    @InjectRepository(NotificationEvent)
    private readonly notificationEventRepository: Repository<NotificationEvent>,

    private readonly notificationsService: NotificationsService,
    private readonly webinarAudienceService: WebinarAudienceService,
  ) {}

  async notifyScheduled(webinarId: string, adminId: string): Promise<void> {
    await this.sendNotification(webinarId, 'scheduled', adminId);
  }

  async notifyStarted(webinarId: string, adminId: string): Promise<void> {
    await this.sendNotification(webinarId, 'started', adminId);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processStartingSoonNotifications(): Promise<void> {
    if (this.isProcessingReminders) {
      return;
    }

    this.isProcessingReminders = true;

    try {
      const now = new Date();
      const reminderWindowEnd = new Date(now.getTime() + 30 * 60 * 1000);

      const webinars = await this.webinarRepository
        .createQueryBuilder('webinar')
        .where('webinar.status = :status', {
          status: WebinarStatus.SCHEDULED,
        })
        .andWhere('webinar.sendNotification = true')
        .andWhere('webinar.scheduledAt > :now', { now })
        .andWhere('webinar.scheduledAt <= :reminderWindowEnd', {
          reminderWindowEnd,
        })
        .orderBy('webinar.scheduledAt', 'ASC')
        .take(100)
        .getMany();

      for (const webinar of webinars) {
        await this.sendNotification(
          webinar.id,
          'reminder',
          webinar.createdByAdminId,
        );
      }
    } catch (error) {
      this.logger.error(
        'Webinar reminder notification processing failed.',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isProcessingReminders = false;
    }
  }

  private async sendNotification(
    webinarId: string,
    kind: WebinarNotificationKind,
    adminId: string,
  ): Promise<void> {
    try {
      const webinar = await this.webinarRepository.findOne({
        where: {
          id: webinarId,
        },
        relations: ['audienceCourses'],
      });

      if (!webinar || !webinar.sendNotification) {
        return;
      }

      if (kind === 'scheduled' && webinar.status !== WebinarStatus.SCHEDULED) {
        return;
      }

      if (kind === 'reminder' && webinar.status !== WebinarStatus.SCHEDULED) {
        return;
      }

      if (kind === 'started' && webinar.status !== WebinarStatus.LIVE) {
        return;
      }

      const deepLink = this.buildDeepLink(webinar, kind);
      const alreadySent = await this.notificationEventRepository.exists({
        where: {
          deepLink,
        },
      });

      if (alreadySent) {
        return;
      }

      const content = this.buildNotificationContent(webinar, kind);
      const courseIds = (webinar.audienceCourses ?? []).map(
        (audienceCourse) => audienceCourse.courseId,
      );

      if (courseIds.length === 0) {
        await this.notificationsService.broadcast(
          {
            title: content.title,
            body: content.body,
            type: NotificationType.SYSTEM,
            priority: content.priority,
            deepLink,
          },
          adminId,
        );
      } else {
        const userIds =
          await this.webinarAudienceService.getEligibleUserIds(courseIds);

        await this.notificationsService.sendToUsers(
          {
            userIds,
            title: content.title,
            body: content.body,
            type: NotificationType.SYSTEM,
            priority: content.priority,
            deepLink,
          },
          adminId,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to send ${kind} notification for webinar ${webinarId}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private buildNotificationContent(
    webinar: Webinar,
    kind: WebinarNotificationKind,
  ): {
    title: string;
    body: string;
    priority: NotificationPriority;
  } {
    const scheduleLabel = this.formatBangladeshDateTime(webinar.scheduledAt);

    if (kind === 'scheduled') {
      return {
        title: 'New webinar scheduled',
        body: `“${webinar.title}” is scheduled for ${scheduleLabel}.`,
        priority: NotificationPriority.NORMAL,
      };
    }

    if (kind === 'reminder') {
      return {
        title: 'Webinar starts in 30 minutes',
        body: `“${webinar.title}” starts at ${scheduleLabel}.`,
        priority: NotificationPriority.HIGH,
      };
    }

    return {
      title: 'Webinar is live now',
      body: `“${webinar.title}” has started. Join the session now.`,
      priority: NotificationPriority.HIGH,
    };
  }

  private buildDeepLink(
    webinar: Webinar,
    kind: WebinarNotificationKind,
  ): string {
    const scheduledVersion =
      kind === 'started' ? '' : `&scheduledAt=${webinar.scheduledAt.getTime()}`;

    return `/webinar?webinarId=${encodeURIComponent(webinar.id)}&notification=${kind}${scheduledVersion}`;
  }

  private formatBangladeshDateTime(value: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Dhaka',
    }).format(value);
  }
}
