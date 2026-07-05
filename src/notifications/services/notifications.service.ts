import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { UserDeviceService } from 'src/devices/services/user-device.service';
import {
  FilePurpose,
  FileUploadStatus,
  FileVisibility,
} from 'src/files/entities/file.entity';
import { FilesService } from 'src/files/services/files.service';
import { S3Service } from 'src/files/services/s3.service';
import { FirebaseAdminService } from 'src/firebase/services/firebase-admin.service';

import {
  BroadcastNotificationDto,
  SendMultipleUsersNotificationDto,
  SendUserNotificationDto,
} from '../dto/notification.dto';
import {
  NotificationCategoryQuery,
  NotificationQueryDto,
} from '../dto/notification-query.dto';
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
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationEvent)
    private readonly notificationEventRepository: Repository<NotificationEvent>,

    @InjectRepository(UserNotification)
    private readonly userNotificationRepository: Repository<UserNotification>,

    @InjectRepository(NotificationDelivery)
    private readonly notificationDeliveryRepository: Repository<NotificationDelivery>,

    private readonly userDeviceService: UserDeviceService,
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly filesService: FilesService,
    private readonly s3Service: S3Service,
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

    const imageUrl = await this.resolveNotificationImageUrl(dto.imageFileId);

    const event = await this.notificationEventRepository.save(
      this.notificationEventRepository.create({
        type: dto.type ?? NotificationType.ADMIN_MESSAGE,
        targetType: NotificationTargetType.USER,
        title: dto.title.trim(),
        body: dto.body.trim(),
        deepLink: dto.deepLink?.trim() || null,
        imageFileId: dto.imageFileId ?? null,
        priority: dto.priority ?? NotificationPriority.NORMAL,
        createdByAdminId: adminId ?? null,
      }),
    );

    await this.createUserNotifications(event.id, userIds);

    const deliveryResult = await this.sendPushToUsers(event, userIds, imageUrl);

    return {
      message: 'Notification sent successfully',
      event,
      totalUsers: userIds.length,
      totalDevices: deliveryResult.totalDevices,
      sentCount: deliveryResult.sentCount,
      failedCount: deliveryResult.failedCount,
    };
  }

  async broadcast(dto: BroadcastNotificationDto, adminId?: string | null) {
    const imageUrl = await this.resolveNotificationImageUrl(dto.imageFileId);

    const devices = await this.userDeviceService.findAllActiveFcmDevices();

    const userIds = Array.from(new Set(devices.map((device) => device.userId)));

    this.logger.log(
      `Preparing broadcast for ${userIds.length} users and ${devices.length} active devices`,
    );

    const event = await this.notificationEventRepository.save(
      this.notificationEventRepository.create({
        type: dto.type ?? NotificationType.ADMIN_MESSAGE,
        targetType: NotificationTargetType.BROADCAST,
        title: dto.title.trim(),
        body: dto.body.trim(),
        deepLink: dto.deepLink?.trim() || null,
        imageFileId: dto.imageFileId ?? null,
        priority: dto.priority ?? NotificationPriority.NORMAL,
        createdByAdminId: adminId ?? null,
      }),
    );

    await this.createUserNotifications(event.id, userIds);

    const deliveryResult = await this.sendPushToUsers(event, userIds, imageUrl);

    return {
      message: 'Broadcast notification sent successfully',
      event,
      totalUsers: userIds.length,
      totalDevices: deliveryResult.totalDevices,
      sentCount: deliveryResult.sentCount,
      failedCount: deliveryResult.failedCount,
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
    const imageUrl = await this.resolveNotificationImageUrl(params.imageFileId);

    const event = await this.notificationEventRepository.save(
      this.notificationEventRepository.create({
        type: params.type,
        targetType: NotificationTargetType.USER,
        title: params.title.trim(),
        body: params.body.trim(),
        deepLink: params.deepLink?.trim() || null,
        imageFileId: params.imageFileId ?? null,
        priority: params.priority ?? NotificationPriority.NORMAL,
        createdByAdminId: null,
      }),
    );

    await this.createUserNotifications(event.id, [params.userId]);

    await this.sendPushToUsers(event, [params.userId], imageUrl);

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

    this.applyCategoryFilter(queryBuilder, query.category);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items: items.map((item) => {
        const event = (item as UserNotification & { event: NotificationEvent })
          .event;
        return {
          ...item,
          category: this.resolveCategory(event),
          tone: this.resolveTone(event),
        };
      }),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private applyCategoryFilter(
    queryBuilder: SelectQueryBuilder<UserNotification>,
    category?: NotificationCategoryQuery,
  ): void {
    if (!category || category === NotificationCategoryQuery.ALL) return;

    const deepLink = `COALESCE(event.deepLink, '')`;
    const socialCondition =
      `(${deepLink} LIKE :messagesLink OR ${deepLink} LIKE :chatLink)`;
    const learningCondition =
      `(${deepLink} LIKE :webinarLink OR ${deepLink} LIKE :courseLink ` +
      `OR ${deepLink} LIKE :finalExamLink ` +
      `OR ${deepLink} LIKE :certificateLink)`;
    const params = {
      messagesLink: '/messages%',
      chatLink: 'italirpothe://messages%',
      webinarLink: '/webinar%',
      courseLink: '/courses%',
      finalExamLink: 'italirpothe://final-exams%',
      certificateLink: 'italirpothe://certificates%',
    };

    if (category === NotificationCategoryQuery.SOCIAL) {
      queryBuilder.andWhere(socialCondition, params);
      return;
    }
    if (category === NotificationCategoryQuery.LEARNING) {
      queryBuilder.andWhere(learningCondition, params);
      return;
    }
    queryBuilder.andWhere(
      `NOT ${socialCondition} AND NOT ${learningCondition}`,
      params,
    );
  }

  private resolveCategory(
    event?: NotificationEvent,
  ): NotificationCategoryQuery {
    const deepLink = event?.deepLink?.trim().toLowerCase() ?? '';
    if (
      deepLink.startsWith('/messages') ||
      deepLink.startsWith('italirpothe://messages')
    ) {
      return NotificationCategoryQuery.SOCIAL;
    }
    if (
      deepLink.startsWith('/webinar') ||
      deepLink.startsWith('/courses') ||
      deepLink.startsWith('italirpothe://final-exams') ||
      deepLink.startsWith('italirpothe://certificates')
    ) {
      return NotificationCategoryQuery.LEARNING;
    }
    return NotificationCategoryQuery.SYSTEM;
  }

  private resolveTone(event?: NotificationEvent): string {
    const deepLink = event?.deepLink?.trim().toLowerCase() ?? '';
    if (
      deepLink.startsWith('/messages') ||
      deepLink.startsWith('italirpothe://messages')
    ) {
      return 'message';
    }
    if (event?.type === NotificationType.STREAK_REMINDER) return 'streak';
    if (deepLink.startsWith('/webinar')) return 'webinar';
    return 'lesson';
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

  private async createUserNotifications(
    eventId: string,
    userIds: string[],
  ): Promise<void> {
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

  private async resolveNotificationImageUrl(
    imageFileId?: string | null,
  ): Promise<string | null> {
    if (!imageFileId) {
      return null;
    }

    const file = await this.filesService.findActiveFileById(imageFileId);

    if (file.uploadStatus !== FileUploadStatus.UPLOADED) {
      throw new BadRequestException(
        'The notification image has not been uploaded successfully.',
      );
    }

    if (file.filePurpose !== FilePurpose.NOTIFICATION_IMAGE) {
      throw new BadRequestException(
        'The selected file is not a notification image.',
      );
    }

    if (!file.mimeType.trim().toLowerCase().startsWith('image/')) {
      throw new BadRequestException(
        'The notification attachment must be an image.',
      );
    }

    if (file.visibility !== FileVisibility.PUBLIC) {
      throw new BadRequestException('The notification image must be public.');
    }

    return this.s3Service.createPublicUrl(file.storageKey);
  }

  private async sendPushToUsers(
    event: NotificationEvent,
    userIds: string[],
    imageUrl: string | null = null,
  ): Promise<{
    totalDevices: number;
    sentCount: number;
    failedCount: number;
  }> {
    if (userIds.length === 0) {
      this.logger.warn(`Notification event ${event.id} has no target users`);

      return {
        totalDevices: 0,
        sentCount: 0,
        failedCount: 0,
      };
    }

    const devices =
      await this.userDeviceService.findActiveFcmDevicesByUsers(userIds);

    /*
     * Map each unique FCM token to its user-device row.
     * This avoids sending twice if duplicate tokens exist.
     */
    const tokenToDevice = new Map<string, (typeof devices)[number]>();

    for (const device of devices) {
      const token = device.fcmToken?.trim();

      if (token && !tokenToDevice.has(token)) {
        tokenToDevice.set(token, device);
      }
    }

    const tokens = Array.from(tokenToDevice.keys());

    this.logger.log(
      `Notification event ${event.id}: found ${tokens.length} active FCM device(s)`,
    );

    if (tokens.length === 0) {
      this.logger.warn(
        `Notification event ${event.id}: no active FCM tokens found`,
      );

      return {
        totalDevices: 0,
        sentCount: 0,
        failedCount: 0,
      };
    }

    const pushResults = await this.firebaseAdminService.sendToTokens({
      tokens,
      title: event.title,
      body: event.body,
      imageUrl,
      deepLink: event.deepLink,
    });

    const deliveries = pushResults
      .map((result) => {
        const device = tokenToDevice.get(result.token);

        if (!device) {
          return null;
        }

        return this.notificationDeliveryRepository.create({
          eventId: event.id,
          userId: device.userId,

          /*
           * This stores user_devices.id.
           * See the note below about the delivery entity.
           */
          deviceTokenId: device.id,

          status: result.success
            ? NotificationDeliveryStatus.SENT
            : NotificationDeliveryStatus.FAILED,
          providerMessageId: result.messageId ?? null,
          errorCode: result.errorCode ?? null,
          errorMessage: result.errorMessage ?? null,
          sentAt: new Date(),
        });
      })
      .filter(
        (delivery): delivery is NotificationDelivery => delivery !== null,
      );

    if (deliveries.length > 0) {
      await this.notificationDeliveryRepository.save(deliveries);
    }

    for (const result of pushResults) {
      if (
        result.errorCode === 'messaging/registration-token-not-registered' ||
        result.errorCode === 'messaging/invalid-registration-token'
      ) {
        await this.userDeviceService.deactivateByFcmToken(result.token);
      }
    }

    const sentCount = pushResults.filter((result) => result.success).length;

    const failedCount = pushResults.length - sentCount;

    this.logger.log(
      `Notification event ${event.id}: sent=${sentCount}, failed=${failedCount}`,
    );

    return {
      totalDevices: tokens.length,
      sentCount,
      failedCount,
    };
  }
}
