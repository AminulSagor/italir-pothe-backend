import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';

import { ScheduleNotificationDto } from '../dto/schedule-notification.dto';
import {
  NotificationPriority,
  NotificationTargetType,
  NotificationType,
} from '../entities/notification-event.entity';
import {
  ScheduledNotification,
  ScheduledNotificationStatus,
} from '../entities/scheduled-notification.entity';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  private isProcessing = false;

  constructor(
    @InjectRepository(ScheduledNotification)
    private readonly scheduledNotificationRepository: Repository<ScheduledNotification>,

    private readonly notificationsService: NotificationsService,
  ) {}

  async schedule(dto: ScheduleNotificationDto, adminId?: string | null) {
    const scheduledAt = new Date(dto.scheduledAt);

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduled date and time.');
    }

    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('Scheduled time must be in the future.');
    }

    const userIds = Array.from(new Set(dto.userIds ?? []));

    if (
      dto.targetType === NotificationTargetType.USER &&
      userIds.length === 0
    ) {
      throw new BadRequestException(
        'At least one user is required for a user-targeted notification.',
      );
    }

    const scheduledNotification =
      await this.scheduledNotificationRepository.save(
        this.scheduledNotificationRepository.create({
          title: dto.title.trim(),
          body: dto.body.trim(),

          type: dto.type ?? NotificationType.ADMIN_MESSAGE,

          priority: dto.priority ?? NotificationPriority.NORMAL,

          targetType: dto.targetType,

          userIds:
            dto.targetType === NotificationTargetType.USER ? userIds : null,

          deepLink: dto.deepLink?.trim() || null,

          imageFileId: dto.imageFileId ?? null,

          scheduledAt,

          status: ScheduledNotificationStatus.SCHEDULED,

          createdByAdminId: adminId ?? null,

          processingStartedAt: null,
          sentAt: null,
          cancelledAt: null,
          errorMessage: null,
        }),
      );

    this.logger.log(
      `Scheduled notification ${scheduledNotification.id} for ${scheduledAt.toISOString()}`,
    );

    return {
      message: 'Notification scheduled successfully',
      item: scheduledNotification,
    };
  }

  async findAll() {
    const [items, total] =
      await this.scheduledNotificationRepository.findAndCount({
        order: {
          scheduledAt: 'DESC',
        },
        take: 100,
      });

    return {
      items,
      total,
    };
  }

  async findOne(id: string): Promise<ScheduledNotification> {
    const item = await this.scheduledNotificationRepository.findOne({
      where: {
        id,
      },
    });

    if (!item) {
      throw new NotFoundException('Scheduled notification not found.');
    }

    return item;
  }

  async cancel(id: string) {
    const item = await this.findOne(id);

    if (item.status !== ScheduledNotificationStatus.SCHEDULED) {
      throw new BadRequestException(
        `A ${item.status} notification cannot be cancelled.`,
      );
    }

    const result = await this.scheduledNotificationRepository.update(
      {
        id,
        status: ScheduledNotificationStatus.SCHEDULED,
      },
      {
        status: ScheduledNotificationStatus.CANCELLED,
        cancelledAt: new Date(),
        processingStartedAt: null,
        errorMessage: null,
      },
    );

    if (!result.affected) {
      throw new BadRequestException(
        'The notification has already started processing.',
      );
    }

    return {
      message: 'Scheduled notification cancelled successfully',
      item: await this.findOne(id),
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledNotifications(): Promise<void> {
    if (this.isProcessing) {
      this.logger.warn('Scheduled notification processor is already running.');

      return;
    }

    this.isProcessing = true;

    try {
      await this.recoverStuckNotifications();

      const dueNotifications = await this.scheduledNotificationRepository.find({
        where: {
          status: ScheduledNotificationStatus.SCHEDULED,

          scheduledAt: LessThanOrEqual(new Date()),
        },

        order: {
          scheduledAt: 'ASC',
        },

        take: 50,
      });

      if (dueNotifications.length === 0) {
        return;
      }

      this.logger.log(
        `Found ${dueNotifications.length} scheduled notification(s) ready to send.`,
      );

      for (const notification of dueNotifications) {
        await this.claimAndProcess(notification.id);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Scheduled notification processing failed: ${errorMessage}`,
        errorStack,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  private async claimAndProcess(id: string): Promise<void> {
    const claimResult = await this.scheduledNotificationRepository.update(
      {
        id,
        status: ScheduledNotificationStatus.SCHEDULED,
      },
      {
        status: ScheduledNotificationStatus.PROCESSING,

        processingStartedAt: new Date(),

        errorMessage: null,
      },
    );

    /*
     * If affected is zero, another cron execution or
     * another backend instance has already claimed it.
     */
    if (!claimResult.affected) {
      return;
    }

    const notification = await this.scheduledNotificationRepository.findOne({
      where: {
        id,
      },
    });

    if (!notification) {
      this.logger.error(
        `Claimed scheduled notification ${id} could not be found.`,
      );

      return;
    }

    await this.processOne(notification);
  }

  private async processOne(notification: ScheduledNotification): Promise<void> {
    try {
      if (notification.targetType === NotificationTargetType.BROADCAST) {
        await this.notificationsService.broadcast(
          {
            title: notification.title,
            body: notification.body,
            type: notification.type,
            priority: notification.priority,

            deepLink: notification.deepLink ?? undefined,

            imageFileId: notification.imageFileId ?? undefined,
          },
          notification.createdByAdminId,
        );
      } else {
        const userIds = notification.userIds ?? [];

        if (userIds.length === 0) {
          throw new Error(
            'No target users were found for the scheduled notification.',
          );
        }

        await this.notificationsService.sendToUsers(
          {
            userIds,
            title: notification.title,
            body: notification.body,
            type: notification.type,
            priority: notification.priority,

            deepLink: notification.deepLink ?? undefined,

            imageFileId: notification.imageFileId ?? undefined,
          },
          notification.createdByAdminId,
        );
      }

      await this.scheduledNotificationRepository.update(notification.id, {
        status: ScheduledNotificationStatus.SENT,

        sentAt: new Date(),
        processingStartedAt: null,
        errorMessage: null,
      });

      this.logger.log(
        `Scheduled notification ${notification.id} sent successfully.`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      const errorStack = error instanceof Error ? error.stack : undefined;

      await this.scheduledNotificationRepository.update(notification.id, {
        status: ScheduledNotificationStatus.FAILED,

        processingStartedAt: null,
        errorMessage,
      });

      this.logger.error(
        `Scheduled notification ${notification.id} failed: ${errorMessage}`,
        errorStack,
      );
    }
  }

  private async recoverStuckNotifications(): Promise<void> {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const result = await this.scheduledNotificationRepository.update(
      {
        status: ScheduledNotificationStatus.PROCESSING,

        processingStartedAt: LessThanOrEqual(fifteenMinutesAgo),
      },
      {
        status: ScheduledNotificationStatus.SCHEDULED,

        processingStartedAt: null,

        errorMessage:
          'Previous processing attempt was interrupted and has been rescheduled.',
      },
    );

    if (result.affected && result.affected > 0) {
      this.logger.warn(
        `Recovered ${result.affected} stuck scheduled notification(s).`,
      );
    }
  }

  async deleteScheduled(id: string) {
    const item = await this.findOne(id);

    if (item.status !== ScheduledNotificationStatus.SCHEDULED) {
      throw new BadRequestException(
        `A ${item.status} notification cannot be deleted.`,
      );
    }

    /*
     * The status condition prevents deletion if the cron
     * starts processing it between findOne() and delete().
     */
    const result = await this.scheduledNotificationRepository.delete({
      id,
      status: ScheduledNotificationStatus.SCHEDULED,
    });

    if (!result.affected) {
      throw new BadRequestException(
        'The notification has already started processing.',
      );
    }

    return {
      message: 'Scheduled notification permanently deleted.',
    };
  }
}
