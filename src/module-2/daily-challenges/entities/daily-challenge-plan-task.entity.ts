import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { DailyChallengeTaskKey } from '../types/daily-challenge.type';

@Entity('daily_challenge_plan_tasks')
@Index(['planId', 'taskKey'], { unique: true })
export class DailyChallengePlanTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  planId: string;

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
  rewardXp: number;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
