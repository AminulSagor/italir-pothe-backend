import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { DeviceTokensService } from 'src/firebase/services/device-tokens.service';
import { FirebaseAdminService } from 'src/firebase/services/firebase-admin.service';
import {
  BroadcastNotificationDto,
  SendMultipleUsersNotificationDto,
  SendUserNotificationDto,
} from '../dto/notification.dto';
import { NotificationQueryDto } from '../dto/notification-query.dto';
import {
  NotificationDelivery,
  NotificationDeliveryStatus,
} from '../entities/notification-delivery.entity';
import {
  NotificationEvent,
  NotificationPriority,
  NotificationTargetType,
  NotificationType,
} from '../entities/notification-event.entity';
import { UserNotification } from '../entities/user-notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationEvent)
    private readonly notificationEventRepository: Repository<NotificationEvent>,

    @InjectRepository(UserNotification)
    private readonly userNotificationRepository: Repository<UserNotification>,

    @InjectRepository(NotificationDelivery)
    private readonly notificationDeliveryRepository: Repository<NotificationDelivery>,

    private readonly deviceTokensService: DeviceTokensService,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  async sendToUser(dto: SendUserNotificationDto, adminId?: string | null) {
    return this.sendToUsers(
      {
        userIds: [dto.userId],
        type: dto.type,
        title: dto.title,
        body: dto.body,
        deepLink: dto.deepLink,
        imageFileId: dto.imageFileId,
        priority: dto.priority,
      },
      adminId,
    );
  }

  async sendToUsers(
    dto: SendMultipleUsersNotificationDto,
    adminId?: string | null,
  ) {
    const userIds = Array.from(new Set(dto.userIds));

    const event = await this.notificationEventRepository.save(
      this.notificationEventRepository.create({
        type: dto.type ?? NotificationType.ADMIN_MESSAGE,
        targetType: NotificationTargetType.USER,
        title: dto.title,
        body: dto.body,
        deepLink: dto.deepLink ?? null,
        imageFileId: dto.imageFileId ?? null,
        priority: dto.priority ?? NotificationPriority.NORMAL,
        createdByAdminId: adminId ?? null,
      }),
    );

    await this.createUserNotifications(event.id, userIds);
    await this.sendPushToUsers(event, userIds);

    return {
      message: 'Notification sent successfully',
      event,
      totalUsers: userIds.length,
    };
  }

  async broadcast(dto: BroadcastNotificationDto, adminId?: string | null) {
    const tokens = await this.deviceTokensService.findAllActiveTokens();
    const userIds = Array.from(new Set(tokens.map((token) => token.userId)));

    const event = await this.notificationEventRepository.save(
      this.notificationEventRepository.create({
        type: dto.type ?? NotificationType.ADMIN_MESSAGE,
        targetType: NotificationTargetType.BROADCAST,
        title: dto.title,
        body: dto.body,
        deepLink: dto.deepLink ?? null,
        imageFileId: dto.imageFileId ?? null,
        priority: dto.priority ?? NotificationPriority.NORMAL,
        createdByAdminId: adminId ?? null,
      }),
    );

    await this.createUserNotifications(event.id, userIds);
    await this.sendPushToUsers(event, userIds);

    return {
      message: 'Broadcast notification sent successfully',
      event,
      totalUsers: userIds.length,
      totalDevices: tokens.length,
    };
  }

  async createSystemNotificationForUser(params: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    deepLink?: string | null;
    imageFileId?: string | null;
    priority?: NotificationPriority;
  }) {
    const event = await this.notificationEventRepository.save(
      this.notificationEventRepository.create({
        type: params.type,
        targetType: NotificationTargetType.USER,
        title: params.title,
        body: params.body,
        deepLink: params.deepLink ?? null,
        imageFileId: params.imageFileId ?? null,
        priority: params.priority ?? NotificationPriority.NORMAL,
        createdByAdminId: null,
      }),
    );

    await this.createUserNotifications(event.id, [params.userId]);
    await this.sendPushToUsers(event, [params.userId]);

    return event;
  }

  async findMyNotifications(userId: string, query: NotificationQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);

    const queryBuilder = this.userNotificationRepository
      .createQueryBuilder('userNotification')
      .leftJoinAndMapOne(
        'userNotification.event',
        NotificationEvent,
        'event',
        'event.id = userNotification.eventId',
      )
      .where('userNotification.userId = :userId', { userId })
      .orderBy('userNotification.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.unreadOnly) {
      queryBuilder.andWhere('userNotification.isRead = false');
    }

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.userNotificationRepository.findOne({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.isRead = true;
    notification.readAt = new Date();

    return this.userNotificationRepository.save(notification);
  }

  async markAllRead(userId: string) {
    await this.userNotificationRepository.update(
      {
        userId,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
    );

    return {
      message: 'All notifications marked as read',
    };
  }

  private async createUserNotifications(eventId: string, userIds: string[]) {
    if (userIds.length === 0) {
      return;
    }

    const rows = userIds.map((userId) =>
      this.userNotificationRepository.create({
        userId,
        eventId,
        isRead: false,
        readAt: null,
      }),
    );

    await this.userNotificationRepository
      .createQueryBuilder()
      .insert()
      .into(UserNotification)
      .values(rows)
      .orIgnore()
      .execute();
  }

  private async sendPushToUsers(event: NotificationEvent, userIds: string[]) {
    if (userIds.length === 0) {
      return;
    }

    const deviceTokens =
      await this.deviceTokensService.findActiveTokensByUsers(userIds);

    if (deviceTokens.length === 0) {
      return;
    }

    const pushResults = await this.firebaseAdminService.sendToTokens({
      tokens: deviceTokens.map((item) => item.token),
      title: event.title,
      body: event.body,
      deepLink: event.deepLink,
    });

    const tokenToDevice = new Map(
      deviceTokens.map((deviceToken) => [deviceToken.token, deviceToken]),
    );

    const deliveries = pushResults
      .map((result) => {
        const deviceToken = tokenToDevice.get(result.token);

        if (!deviceToken) {
          return null;
        }

        return this.notificationDeliveryRepository.create({
          eventId: event.id,
          userId: deviceToken.userId,
          deviceTokenId: deviceToken.id,
          status: result.success
            ? NotificationDeliveryStatus.SENT
            : NotificationDeliveryStatus.FAILED,
          providerMessageId: result.messageId,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          sentAt: new Date(),
        });
      })
      .filter((item): item is NotificationDelivery => item !== null);

    await this.notificationDeliveryRepository.save(deliveries);

    for (const result of pushResults) {
      if (
        result.errorCode === 'messaging/registration-token-not-registered' ||
        result.errorCode === 'messaging/invalid-registration-token'
      ) {
        await this.deviceTokensService.deactivateByToken(result.token);
      }
    }
  }
}
