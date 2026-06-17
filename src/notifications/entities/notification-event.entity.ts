import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum NotificationType {
  SYSTEM = 'system',
  ADMIN_MESSAGE = 'admin_message',
  STREAK_REMINDER = 'streak_reminder',
  DAILY_CHEST = 'daily_chest',
}

export enum NotificationTargetType {
  USER = 'user',
  BROADCAST = 'broadcast',
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
}

@Entity('notification_events')
export class NotificationEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.SYSTEM,
  })
  type: NotificationType;

  @Column({
    type: 'enum',
    enum: NotificationTargetType,
    default: NotificationTargetType.USER,
  })
  targetType: NotificationTargetType;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'varchar', length: 500 })
  body: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  deepLink: string | null;

  @Column({ type: 'uuid', nullable: true })
  imageFileId: string | null;

  @Column({
    type: 'enum',
    enum: NotificationPriority,
    default: NotificationPriority.NORMAL,
  })
  priority: NotificationPriority;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  createdByAdminId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
