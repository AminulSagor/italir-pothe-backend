import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  GooglePlayVoidedRecordDomain,
  GooglePlayVoidedRecordStatus,
} from 'src/billing/types/google-play-reconciliation.type';

@Entity('google_play_voided_purchase_records')
@Index(['fingerprint'], {
  unique: true,
})
@Index(['status', 'nextAttemptAt'])
@Index(['providerOrderId'])
@Index(['purchaseTokenHash'])
export class GooglePlayVoidedPurchaseRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 64,
  })
  fingerprint: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  providerOrderId: string;

  @Column({
    type: 'varchar',
    length: 64,
  })
  purchaseTokenHash: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  purchaseTime: Date | null;

  @Column({
    type: 'timestamptz',
  })
  voidedTime: Date;

  @Column({
    type: 'integer',
    nullable: true,
  })
  voidedReason: number | null;

  @Column({
    type: 'integer',
    nullable: true,
  })
  voidedSource: number | null;

  @Column({
    type: 'integer',
    nullable: true,
  })
  voidedQuantity: number | null;

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
    type: 'enum',
    enum: GooglePlayVoidedRecordDomain,
    default: GooglePlayVoidedRecordDomain.UNKNOWN,
  })
  matchedDomain: GooglePlayVoidedRecordDomain;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  internalOrderId: string | null;

  @Column({
    type: 'enum',
    enum: GooglePlayVoidedRecordStatus,
    default: GooglePlayVoidedRecordStatus.PENDING,
  })
  status: GooglePlayVoidedRecordStatus;

  @Column({
    type: 'integer',
    default: 0,
  })
  attemptCount: number;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  processingResult: Record<string, unknown> | null;

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
  discoveredAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
