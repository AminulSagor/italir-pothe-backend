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

@Entity('leaderboard_reward_shipping_addresses')
@Index(['rewardId'], { unique: true })
export class LeaderboardRewardShippingAddress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  rewardId: string;

  @Column({
    type: 'varchar',
    length: 180,
  })
  fullName: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  whatsappNumber: string;

  @Column({
    type: 'varchar',
    length: 1200,
  })
  addressLine: string;

  @Column({
    type: 'varchar',
    length: 2,
    default: 'IT',
  })
  countryCode: string;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  latitude: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  longitude: string | null;

  @Column({
    type: 'boolean',
    default: false,
  })
  isLocked: boolean;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @OneToOne(() => LeaderboardReward, (reward) => reward.shippingAddress, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'rewardId',
  })
  reward: LeaderboardReward;
}
