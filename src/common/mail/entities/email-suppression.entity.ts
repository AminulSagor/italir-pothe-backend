import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum EmailSuppressionReason {
  HARD_BOUNCE = 'hard_bounce',
  COMPLAINT = 'complaint',
}

@Entity('email_suppressions')
export class EmailSuppression {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('UQ_email_suppressions_email', { unique: true })
  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'varchar', length: 40 })
  reason: EmailSuppressionReason;

  @Index('IDX_email_suppressions_source_event')
  @Column({ type: 'varchar', length: 255, nullable: true })
  sourceEventId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  details: string | null;

  @Column({ type: 'timestamptz' })
  suppressedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
