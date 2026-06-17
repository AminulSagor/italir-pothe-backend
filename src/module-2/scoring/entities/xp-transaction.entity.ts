import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum XpTransactionSource {
  QUIZ_SESSION = 'quiz_session',
  FINAL_EXAM = 'final_exam',
  DAILY_CHALLENGE = 'daily_challenge',
  MANUAL_ADJUSTMENT = 'manual_adjustment',
}

@Entity('xp_transactions')
@Index(['source', 'sourceId'], { unique: true })
export class XpTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: XpTransactionSource,
  })
  source: XpTransactionSource;

  @Column({ type: 'varchar', length: 120 })
  sourceId: string;

  @Column({ type: 'integer', default: 0 })
  amount: number;

  @Column({ type: 'integer', default: 0 })
  baseAmount: number;

  @Column({ type: 'integer', default: 0 })
  bonusAmount: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 1 })
  multiplier: number;

  @Column({ type: 'integer', default: 0 })
  boostAmount: number;

  @Column({ type: 'varchar', length: 180, nullable: true })
  reason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
