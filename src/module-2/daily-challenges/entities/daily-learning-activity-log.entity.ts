import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { LearningActivityType } from '../types/daily-challenge.type';

@Entity('daily_learning_activity_logs')
@Index(['userId', 'activityType', 'sourceId'], { unique: true })
export class DailyLearningActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: LearningActivityType,
  })
  activityType: LearningActivityType;

  @Column({ type: 'varchar', length: 160 })
  sourceId: string;

  @Column({ type: 'date' })
  activityDate: string;

  @Column({ type: 'integer', default: 1 })
  value: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
