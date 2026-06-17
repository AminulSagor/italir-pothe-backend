import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum NotificationDeliveryStatus {
  SENT = 'sent',
  FAILED = 'failed',
}

@Entity('notification_deliveries')
export class NotificationDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  eventId: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  deviceTokenId: string;

  @Column({
    type: 'enum',
    enum: NotificationDeliveryStatus,
  })
  status: NotificationDeliveryStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerMessageId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  errorCode: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  errorMessage: string | null;

  @Column({ type: 'timestamptz' })
  sentAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
