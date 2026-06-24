import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { LeaderboardReward } from './leaderboard-reward.entity';

@Entity('leaderboard_reward_values')
@Index(['rewardId'], { unique: true })
export class LeaderboardRewardValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  rewardId: string;

  /**
   * Examples:
   * 500 XP
   * 3 Streak Freezers
   * 100 CV Credits
   * 500 AI tokens
   */
  @Column({
    type: 'integer',
    nullable: true,
  })
  primaryAmount: number | null;

  /**
   * Used mainly by AI Package:
   * 60 AI minutes.
   */
  @Column({
    type: 'integer',
    nullable: true,
  })
  secondaryAmount: number | null;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  primaryUnit: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  secondaryUnit: string | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  appliedAt: Date | null;

  @Column({
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  applicationReference: string | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @OneToOne(() => LeaderboardReward, (reward) => reward.value, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'rewardId',
  })
  reward: LeaderboardReward;
}
