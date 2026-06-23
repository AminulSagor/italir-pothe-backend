import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  NotificationPriority,
  NotificationTargetType,
  NotificationType,
} from './notification-event.entity';
export enum ScheduledNotificationStatus {
  SCHEDULED = 'scheduled',
  PROCESSING = 'processing',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
@Entity('scheduled_notifications')
@Index('IDX_scheduled_notifications_status_scheduled_at', [
  'status',
  'scheduledAt',
])
export class ScheduledNotification {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 180 }) title: string;
  @Column({ type: 'varchar', length: 500 }) body: string;
  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.ADMIN_MESSAGE,
  })
  type: NotificationType;
  @Column({
    type: 'enum',
    enum: NotificationPriority,
    default: NotificationPriority.NORMAL,
  })
  priority: NotificationPriority;
  @Column({ type: 'enum', enum: NotificationTargetType })
  targetType: NotificationTargetType;
  @Column({ type: 'jsonb', nullable: true }) userIds: string[] | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) deepLink:
    | string
    | null;
  @Column({ type: 'uuid', nullable: true }) imageFileId: string | null;
  @Index() @Column({ type: 'timestamptz' }) scheduledAt: Date;
  @Column({
    type: 'enum',
    enum: ScheduledNotificationStatus,
    default: ScheduledNotificationStatus.SCHEDULED,
  })
  status: ScheduledNotificationStatus;
  @Index() @Column({ type: 'uuid', nullable: true }) createdByAdminId:
    | string
    | null;
  @Column({ type: 'timestamptz', nullable: true })
  processingStartedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) sentAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) cancelledAt: Date | null;
  @Column({ type: 'text', nullable: true }) errorMessage: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
