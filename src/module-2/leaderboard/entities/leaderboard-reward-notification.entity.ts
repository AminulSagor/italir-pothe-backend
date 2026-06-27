import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  LeaderboardRewardNotificationStatus,
  LeaderboardRewardNotificationType,
} from '../types/leaderboard.type';
import { LeaderboardReward } from './leaderboard-reward.entity';

@Entity('leaderboard_reward_notifications')
@Index(['rewardId', 'createdAt'])
@Index(['status'])
export class LeaderboardRewardNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  rewardId: string;

  @Column({
    type: 'uuid',
  })
  userId: string;

  @Column({
    type: 'enum',
    enum: LeaderboardRewardNotificationType,
  })
  type: LeaderboardRewardNotificationType;

  @Column({
    type: 'enum',
    enum: LeaderboardRewardNotificationStatus,
    default: LeaderboardRewardNotificationStatus.QUEUED,
  })
  status: LeaderboardRewardNotificationStatus;

  @Column({
    type: 'varchar',
    length: 180,
  })
  title: string;

  @Column({
    type: 'varchar',
    length: 1000,
  })
  body: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  sentAt: Date | null;

  @Column({
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  errorMessage: string | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @ManyToOne(() => LeaderboardReward, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'rewardId',
  })
  reward: LeaderboardReward;
}
