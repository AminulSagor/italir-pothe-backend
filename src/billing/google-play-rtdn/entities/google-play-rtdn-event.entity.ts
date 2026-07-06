import {
  GooglePlayRtdnEventStatus,
  GooglePlayRtdnNotificationKind,
} from 'src/billing/types/google-play-rtdn.type';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('google_play_rtdn_events')
@Index(['messageId'], {
  unique: true,
})
@Index(['status', 'nextAttemptAt'])
@Index(['purchaseTokenHash'])
@Index(['providerOrderId'])
export class GooglePlayRtdnEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  messageId: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  pubsubSubscription: string | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  publishTime: Date | null;

  @Column({
    type: 'varchar',
    length: 255,
  })
  packageName: string;

  @Column({
    type: 'timestamptz',
  })
  eventTime: Date;

  @Column({
    type: 'enum',
    enum: GooglePlayRtdnNotificationKind,
  })
  notificationKind: GooglePlayRtdnNotificationKind;

  @Column({
    type: 'integer',
    nullable: true,
  })
  notificationType: number | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  productId: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerOrderId: string | null;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  purchaseTokenHash: string | null;

  /*
   * The raw RTDN payload contains the Google Play purchase token.
   * Store it encrypted, never as plain JSON.
   */
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
    nullable: true,
  })
  pubsubAttributes: Record<string, string> | null;

  /*
   * Sanitized response retrieved from the Google Play Developer API.
   * This does not contain the purchase token.
   */
  @Column({
    type: 'jsonb',
    nullable: true,
  })
  authoritativePayload: Record<string, unknown> | null;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  processingResult: Record<string, unknown> | null;

  @Column({
    type: 'enum',
    enum: GooglePlayRtdnEventStatus,
    default: GooglePlayRtdnEventStatus.PENDING,
  })
  status: GooglePlayRtdnEventStatus;

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
