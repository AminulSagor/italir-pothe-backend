import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum DailyChestRewardType {
  XP = 'xp',
  STREAK_FREEZE = 'streak_freeze',
  XP_AND_STREAK_FREEZE = 'xp_and_streak_freeze',
}

@Entity('user_daily_chest_rewards')
@Index(['userId', 'challengeDate'], { unique: true })
export class UserDailyChestReward {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'date' })
  challengeDate: string;

  @Column({
    type: 'enum',
    enum: DailyChestRewardType,
    default: DailyChestRewardType.XP,
  })
  rewardType: DailyChestRewardType;

  @Column({ type: 'integer', default: 0 })
  xpAmount: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 1 })
  boostMultiplier: number;

  @Column({ type: 'integer', default: 0 })
  boostXp: number;

  @Column({ type: 'integer', default: 0 })
  totalXpAwarded: number;

  @Column({ type: 'integer', default: 0 })
  streakFreezeCount: number;

  @Column({ type: 'timestamptz' })
  openedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
