import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  NotificationPriority,
  NotificationTargetType,
  NotificationType,
} from '../entities/notification-event.entity';
export class ScheduleNotificationDto {
  @IsString() @IsNotEmpty() @MaxLength(180) title: string;
  @IsString() @IsNotEmpty() @MaxLength(500) body: string;
  @IsEnum(NotificationTargetType) targetType: NotificationTargetType;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) userIds?: string[];
  @IsOptional() @IsEnum(NotificationType) type?: NotificationType;
  @IsOptional() @IsEnum(NotificationPriority) priority?: NotificationPriority;
  @IsOptional() @IsString() @MaxLength(500) deepLink?: string;
  @IsOptional() @IsUUID('4') imageFileId?: string;
  @IsDateString() scheduledAt: string;
}
