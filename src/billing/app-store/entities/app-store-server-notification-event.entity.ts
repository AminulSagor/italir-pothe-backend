import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { StoreProviderEnvironment } from 'src/package-store/types/package-store.type';

import { AppStoreNotificationEventStatus } from 'src/billing/types/app-store-billing.type';

@Entity('app_store_server_notification_events')
@Index(['notificationUuid'], {
  unique: true,
})
@Index(['signedPayloadHash'], {
  unique: true,
})
@Index(['status', 'nextAttemptAt'])
@Index(['transactionId'])
@Index(['originalTransactionId'])
export class AppStoreServerNotificationEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  notificationUuid: string;

  @Column({
    type: 'varchar',
    length: 80,
  })
  notificationType: string;

  @Column({
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  subtype: string | null;

  @Column({
    type: 'enum',
    enum: StoreProviderEnvironment,
  })
  environment: StoreProviderEnvironment;

  @Column({
    type: 'timestamptz',
  })
  signedDate: Date;

  @Column({
    type: 'varchar',
    length: 64,
  })
  signedPayloadHash: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  transactionId: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  originalTransactionId: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  productId: string | null;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  appAccountToken: string | null;

  @Column({
    type: 'text',
  })
  payloadCiphertext: string;

  @Column({
    type: 'varchar',
    length: 64,
  })
  payloadIv: string;

  @Column({
    type: 'varchar',
    length: 64,
  })
  payloadAuthTag: string;

  @Column({
    type: 'jsonb',
  })
  sanitizedPayload: Record<string, unknown>;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  processingResult: Record<string, unknown> | null;

  @Column({
    type: 'enum',
    enum: AppStoreNotificationEventStatus,

    default: AppStoreNotificationEventStatus.PENDING,
  })
  status: AppStoreNotificationEventStatus;

  @Column({
    type: 'integer',
    default: 0,
  })
  attemptCount: number;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  lastErrorCode: string | null;

  @Column({
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  lastErrorMessage: string | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  nextAttemptAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  processingStartedAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  processedAt: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  receivedAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
