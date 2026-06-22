import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { File as StoredFile } from 'src/files/entities/file.entity';
import { S3Service } from 'src/files/services/s3.service';
import { User } from 'src/users/entities/user.entity';

import { AdminNotificationHistoryQueryDto } from '../dto/admin-notification-history-query.dto';
import {
  NotificationDelivery,
  NotificationDeliveryStatus,
} from '../entities/notification-delivery.entity';
import {
  NotificationEvent,
  NotificationTargetType,
} from '../entities/notification-event.entity';
import {
  ScheduledNotification,
  ScheduledNotificationStatus,
} from '../entities/scheduled-notification.entity';
import { UserNotification } from '../entities/user-notification.entity';

type HistorySource = 'notification_event' | 'scheduled_notification';

type HistoryRecord =
  | {
      source: 'notification_event';
      entity: NotificationEvent;
      sortAt: Date;
    }
  | {
      source: 'scheduled_notification';
      entity: ScheduledNotification;
      sortAt: Date;
    };

interface DeliverySummaryRow {
  eventId: string;
  sentCount: string;
  failedCount: string;
  lastSentAt: Date | string | null;
}

@Injectable()
export class AdminNotificationHistoryService {
  constructor(
    @InjectRepository(NotificationEvent)
    private readonly notificationEventRepository: Repository<NotificationEvent>,

    @InjectRepository(ScheduledNotification)
    private readonly scheduledNotificationRepository: Repository<ScheduledNotification>,

    @InjectRepository(NotificationDelivery)
    private readonly notificationDeliveryRepository: Repository<NotificationDelivery>,

    @InjectRepository(UserNotification)
    private readonly userNotificationRepository: Repository<UserNotification>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(StoredFile)
    private readonly fileRepository: Repository<StoredFile>,

    private readonly s3Service: S3Service,
  ) {}

  async findAll(query: AdminNotificationHistoryQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    const offset = (page - 1) * limit;

    /*
     * Taking page * limit records from each table is
     * enough to calculate the requested merged page.
     */
    const fetchLimit = page * limit;

    const search = query.search?.trim() ?? '';
    const searchValue = `%${search}%`;

    const scheduledQuery = this.scheduledNotificationRepository
      .createQueryBuilder('scheduled')
      /*
       * Once a scheduled notification is sent, an entry
       * is created in notification_events. Excluding SENT
       * rows prevents the same notification appearing twice.
       */
      .where('scheduled.status != :sentStatus', {
        sentStatus: ScheduledNotificationStatus.SENT,
      })
      .orderBy('scheduled.createdAt', 'DESC')
      .take(fetchLimit);

    const eventQuery = this.notificationEventRepository
      .createQueryBuilder('event')
      /*
       * System and streak notifications have no admin ID.
       * The admin dashboard should show admin-created
       * campaigns only.
       */
      .where('event.createdByAdminId IS NOT NULL')
      .orderBy('event.createdAt', 'DESC')
      .take(fetchLimit);

    if (search) {
      scheduledQuery.andWhere(
        `(
          scheduled.title ILIKE :search
          OR scheduled.body ILIKE :search
        )`,
        {
          search: searchValue,
        },
      );

      eventQuery.andWhere(
        `(
          event.title ILIKE :search
          OR event.body ILIKE :search
        )`,
        {
          search: searchValue,
        },
      );
    }

    const [
      [scheduledItems, scheduledTotal],
      [eventItems, eventTotal],
      totalSent,
      scheduledCount,
      nextScheduled,
    ] = await Promise.all([
      scheduledQuery.getManyAndCount(),
      eventQuery.getManyAndCount(),

      this.notificationEventRepository
        .createQueryBuilder('event')
        .where('event.createdByAdminId IS NOT NULL')
        .getCount(),

      this.scheduledNotificationRepository.count({
        where: {
          status: ScheduledNotificationStatus.SCHEDULED,
        },
      }),

      this.scheduledNotificationRepository.findOne({
        where: {
          status: ScheduledNotificationStatus.SCHEDULED,
        },
        order: {
          scheduledAt: 'ASC',
        },
      }),
    ]);

    const combinedRecords: HistoryRecord[] = [
      ...scheduledItems.map(
        (entity): HistoryRecord => ({
          source: 'scheduled_notification',
          entity,
          sortAt: entity.createdAt,
        }),
      ),

      ...eventItems.map(
        (entity): HistoryRecord => ({
          source: 'notification_event',
          entity,
          sortAt: entity.createdAt,
        }),
      ),
    ];

    combinedRecords.sort(
      (first, second) => second.sortAt.getTime() - first.sortAt.getTime(),
    );

    const currentPageRecords = combinedRecords.slice(offset, offset + limit);

    const items = await this.hydrateRecords(currentPageRecords);

    const total = scheduledTotal + eventTotal;

    return {
      items,
      stats: {
        totalSent,
        scheduled: scheduledCount,
        nextScheduled: nextScheduled
          ? {
              id: nextScheduled.id,
              title: nextScheduled.title,
              scheduledAt: nextScheduled.scheduledAt,
            }
          : null,
      },
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const scheduledItem = await this.scheduledNotificationRepository.findOne({
      where: {
        id,
      },
    });

    if (scheduledItem) {
      const [item] = await this.hydrateRecords([
        {
          source: 'scheduled_notification',
          entity: scheduledItem,
          sortAt: scheduledItem.createdAt,
        },
      ]);

      return item;
    }

    const eventItem = await this.notificationEventRepository
      .createQueryBuilder('event')
      .where('event.id = :id', {
        id,
      })
      .andWhere('event.createdByAdminId IS NOT NULL')
      .getOne();

    if (!eventItem) {
      throw new NotFoundException('Notification history item not found.');
    }

    const [item] = await this.hydrateRecords([
      {
        source: 'notification_event',
        entity: eventItem,
        sortAt: eventItem.createdAt,
      },
    ]);

    return item;
  }

  private async hydrateRecords(records: HistoryRecord[]) {
    if (records.length === 0) {
      return [];
    }

    const eventIds = records
      .filter(
        (
          record,
        ): record is Extract<
          HistoryRecord,
          {
            source: 'notification_event';
          }
        > => record.source === 'notification_event',
      )
      .map((record) => record.entity.id);

    const imageFileIds = Array.from(
      new Set(
        records
          .map((record) => record.entity.imageFileId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const scheduledUserIds = records.flatMap((record) => {
      if (
        record.source !== 'scheduled_notification' ||
        record.entity.targetType !== NotificationTargetType.USER
      ) {
        return [];
      }

      return record.entity.userIds ?? [];
    });

    const [deliveryRows, eventUserNotifications, files] = await Promise.all([
      this.getDeliverySummaries(eventIds),

      eventIds.length > 0
        ? this.userNotificationRepository.find({
            where: {
              eventId: In(eventIds),
            },
            select: {
              eventId: true,
              userId: true,
            },
          })
        : Promise.resolve([]),

      imageFileIds.length > 0
        ? this.fileRepository.find({
            where: {
              id: In(imageFileIds),
            },
            select: {
              id: true,
              storageKey: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const allUserIds = Array.from(
      new Set([
        ...scheduledUserIds,
        ...eventUserNotifications.map((item) => item.userId),
      ]),
    );

    const users =
      allUserIds.length > 0
        ? await this.userRepository.find({
            where: {
              id: In(allUserIds),
            },
            select: {
              id: true,
              fullName: true,
            },
          })
        : [];

    const userNameById = new Map(users.map((user) => [user.id, user.fullName]));

    const fileUrlById = new Map(
      files.map((file) => [
        file.id,
        this.s3Service.createPublicUrl(file.storageKey),
      ]),
    );

    const eventUserIds = new Map<string, string[]>();

    for (const item of eventUserNotifications) {
      const current = eventUserIds.get(item.eventId) ?? [];

      current.push(item.userId);

      eventUserIds.set(item.eventId, current);
    }

    const deliveryByEventId = new Map(
      deliveryRows.map((row) => [row.eventId, row]),
    );

    return records.map((record) => {
      if (record.source === 'scheduled_notification') {
        const item = record.entity;

        const targetUserIds = item.userIds ?? [];

        return {
          id: item.id,
          source: 'scheduled_notification' as HistorySource,
          title: item.title,
          body: item.body,
          imageFileId: item.imageFileId,
          imageUrl: item.imageFileId
            ? (fileUrlById.get(item.imageFileId) ?? null)
            : null,
          targetType: item.targetType,
          targetAudienceName: this.resolveAudienceName(
            item.targetType,
            targetUserIds,
            userNameById,
          ),
          status: item.status,
          scheduledAt: item.scheduledAt,
          sentAt: item.sentAt,
          createdAt: item.createdAt,
          errorMessage: item.errorMessage,
          canDelete: item.status === ScheduledNotificationStatus.SCHEDULED,
        };
      }

      const event = record.entity;
      const delivery = deliveryByEventId.get(event.id);

      const sentCount = Number(delivery?.sentCount ?? 0);

      const failedCount = Number(delivery?.failedCount ?? 0);

      /*
       * If every recorded delivery failed, show FAILED.
       * Otherwise the send operation is considered complete.
       */
      const status =
        failedCount > 0 && sentCount === 0 ? 'failed' : 'completed';

      const targetUserIds = eventUserIds.get(event.id) ?? [];

      return {
        id: event.id,
        source: 'notification_event' as HistorySource,
        title: event.title,
        body: event.body,
        imageFileId: event.imageFileId,
        imageUrl: event.imageFileId
          ? (fileUrlById.get(event.imageFileId) ?? null)
          : null,
        targetType: event.targetType,
        targetAudienceName: this.resolveAudienceName(
          event.targetType,
          targetUserIds,
          userNameById,
        ),
        status,
        scheduledAt: null,
        sentAt: delivery?.lastSentAt ?? event.createdAt,
        createdAt: event.createdAt,
        errorMessage: null,
        canDelete: false,
        sentCount,
        failedCount,
      };
    });
  }

  private async getDeliverySummaries(
    eventIds: string[],
  ): Promise<DeliverySummaryRow[]> {
    if (eventIds.length === 0) {
      return [];
    }

    return this.notificationDeliveryRepository
      .createQueryBuilder('delivery')
      .select('delivery.eventId', 'eventId')
      .addSelect(
        `SUM(
          CASE
            WHEN delivery.status = :sentStatus
            THEN 1
            ELSE 0
          END
        )`,
        'sentCount',
      )
      .addSelect(
        `SUM(
          CASE
            WHEN delivery.status = :failedStatus
            THEN 1
            ELSE 0
          END
        )`,
        'failedCount',
      )
      .addSelect('MAX(delivery.sentAt)', 'lastSentAt')
      .where('delivery.eventId IN (:...eventIds)', {
        eventIds,
        sentStatus: NotificationDeliveryStatus.SENT,
        failedStatus: NotificationDeliveryStatus.FAILED,
      })
      .groupBy('delivery.eventId')
      .getRawMany<DeliverySummaryRow>();
  }

  private resolveAudienceName(
    targetType: NotificationTargetType,
    userIds: string[],
    userNameById: Map<string, string>,
  ): string {
    if (targetType === NotificationTargetType.BROADCAST) {
      return 'All Users';
    }

    const userNames = Array.from(
      new Set(
        userIds
          .map((id) => userNameById.get(id))
          .filter((name): name is string => Boolean(name)),
      ),
    );

    if (userNames.length === 0) {
      return 'Selected User';
    }

    return userNames.join(', ');
  }
}
