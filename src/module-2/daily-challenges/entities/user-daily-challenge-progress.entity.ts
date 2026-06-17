import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { DailyChallengeTaskKey } from '../types/daily-challenge.type';

export enum DailyChallengeProgressStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CLAIMED = 'claimed',
}

@Entity('user_daily_challenge_progress')
@Index(['userId', 'challengeDate', 'taskKey'], { unique: true })
export class UserDailyChallengeProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'date' })
  challengeDate: string;

  @Column({
    type: 'enum',
    enum: DailyChallengeTaskKey,
  })
  taskKey: DailyChallengeTaskKey;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'integer' })
  targetValue: number;

  @Column({ type: 'integer', default: 0 })
  progressValue: number;

  @Column({ type: 'integer', default: 0 })
  rewardXp: number;

  @Column({
    type: 'enum',
    enum: DailyChallengeProgressStatus,
    default: DailyChallengeProgressStatus.IN_PROGRESS,
  })
  status: DailyChallengeProgressStatus;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  claimedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
