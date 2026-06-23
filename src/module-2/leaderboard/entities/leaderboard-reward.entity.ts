import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  LeagueKey,
  LeaderboardRewardStatus,
  LeaderboardRewardType,
} from '../types/leaderboard.type';

@Entity('leaderboard_rewards')
@Index(['userId', 'createdAt'])
@Index(['status'])
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
    length: 1000,
    nullable: true,
  })
  description: string | null;

  @Column({
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  rewardValue: string | null;

  @Column({
    type: 'integer',
    nullable: true,
  })
  xpAmount: number | null;

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
    type: 'timestamptz',
  })
  issuedAt: Date;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
