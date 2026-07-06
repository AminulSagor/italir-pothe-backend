import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { GooglePlayReconciliationJobKey } from 'src/billing/types/google-play-reconciliation.type';

@Entity('google_play_reconciliation_checkpoints')
export class GooglePlayReconciliationCheckpoint {
  @PrimaryColumn({
    type: 'enum',
    enum: GooglePlayReconciliationJobKey,
  })
  key: GooglePlayReconciliationJobKey;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  lastSuccessfulEndTime: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  lastStartedAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  lastCompletedAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  lastFailedAt: Date | null;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  leaseOwner: string | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  leaseExpiresAt: Date | null;

  @Column({
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  lastErrorMessage: string | null;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  lastResult: Record<string, unknown> | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
