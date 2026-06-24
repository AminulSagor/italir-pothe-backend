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

@Entity('leaderboard_reward_fulfillments')
@Index(['rewardId'], { unique: true })
export class LeaderboardRewardFulfillment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  rewardId: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  addressRequestedAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  addressReceivedAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  processingAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  dispatchedAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  deliveredAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  lastNotificationAt: Date | null;

  @Column({
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  carrierName: string | null;

  @Column({
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  trackingNumber: string | null;

  @Column({
    type: 'varchar',
    length: 1200,
    nullable: true,
  })
  invoiceUrl: string | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @OneToOne(() => LeaderboardReward, (reward) => reward.fulfillment, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'rewardId',
  })
  reward: LeaderboardReward;
}
