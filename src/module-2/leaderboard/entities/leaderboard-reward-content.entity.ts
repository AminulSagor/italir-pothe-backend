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

@Entity('leaderboard_reward_contents')
@Index(['rewardId'], { unique: true })
export class LeaderboardRewardContent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  rewardId: string;

  @Column({
    type: 'varchar',
    length: 1500,
    nullable: true,
  })
  congratulatoryNote: string | null;

  @Column({
    type: 'varchar',
    length: 1500,
    nullable: true,
  })
  earnedReason: string | null;

  @Column({
    type: 'varchar',
    length: 1200,
    nullable: true,
  })
  imageUrl: string | null;

  @Column({
    type: 'varchar',
    length: 1200,
    nullable: true,
  })
  fileUrl: string | null;

  /**
   * Course ID, certificate ID, badge ID,
   * guide ID or another linked resource.
   */
  @Column({
    type: 'uuid',
    nullable: true,
  })
  relatedResourceId: string | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @OneToOne(() => LeaderboardReward, (reward) => reward.content, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'rewardId',
  })
  reward: LeaderboardReward;
}
