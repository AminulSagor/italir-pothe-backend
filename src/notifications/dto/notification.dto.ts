import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import {
  NotificationPriority,
  NotificationType,
} from '../entities/notification-event.entity';

export class SendUserNotificationDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsString()
  @MaxLength(180)
  title: string;

  @IsString()
  @MaxLength(500)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deepLink?: string;

  @IsOptional()
  @IsUUID()
  imageFileId?: string;

  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;
}

export class BroadcastNotificationDto {
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsString()
  @MaxLength(180)
  title: string;

  @IsString()
  @MaxLength(500)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deepLink?: string;

  @IsOptional()
  @IsUUID()
  imageFileId?: string;

  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;
}

export class SendMultipleUsersNotificationDto {
  @IsArray()
  @IsUUID('4', { each: true })
  userIds: string[];

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsString()
  @MaxLength(180)
  title: string;

  @IsString()
  @MaxLength(500)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deepLink?: string;

  @IsOptional()
  @IsUUID()
  imageFileId?: string;

  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;
}
