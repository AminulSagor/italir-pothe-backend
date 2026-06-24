import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  LeagueKey,
  LeaderboardRewardStatus,
  LeaderboardRewardType,
} from '../types/leaderboard.type';
import { LeaderboardRewardContent } from './leaderboard-reward-content.entity';
import { LeaderboardRewardFulfillment } from './leaderboard-reward-fulfillment.entity';
import { LeaderboardRewardShippingAddress } from './leaderboard-reward-shipping-address.entity';
import { LeaderboardRewardValue } from './leaderboard-reward-value.entity';

@Entity('leaderboard_rewards')
@Index(['userId', 'createdAt'])
@Index(['status'])
@Index(['rewardType'])
@Index(['leagueKey'])
export class LeaderboardReward {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  userId: string;

  @Column({
    type: 'enum',
    enum: LeagueKey,
  })
  leagueKey: LeagueKey;

  @Column({
    type: 'enum',
    enum: LeaderboardRewardType,
  })
  rewardType: LeaderboardRewardType;

  @Column({
    type: 'varchar',
    length: 180,
  })
  title: string;

  @Column({
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  subtitle: string | null;

  @Column({
    type: 'enum',
    enum: LeaderboardRewardStatus,
    default: LeaderboardRewardStatus.PENDING,
  })
  status: LeaderboardRewardStatus;

  @Column({
    type: 'uuid',
  })
  issuedByUserId: string;

  @Column({
    type: 'boolean',
    default: true,
  })
  sendPushNotification: boolean;

  @Column({
    type: 'boolean',
    default: true,
  })
  playConfettiAnimation: boolean;

  @Column({
    type: 'boolean',
    default: false,
  })
  requestShippingAddress: boolean;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  seenAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  openedAt: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @OneToOne(() => LeaderboardRewardContent, (content) => content.reward)
  content: LeaderboardRewardContent;

  @OneToOne(() => LeaderboardRewardValue, (value) => value.reward)
  value: LeaderboardRewardValue;

  @OneToOne(
    () => LeaderboardRewardFulfillment,
    (fulfillment) => fulfillment.reward,
  )
  fulfillment: LeaderboardRewardFulfillment;

  @OneToOne(
    () => LeaderboardRewardShippingAddress,
    (shippingAddress) => shippingAddress.reward,
  )
  shippingAddress: LeaderboardRewardShippingAddress;
}
