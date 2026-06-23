import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { LeaderboardXpSourceType } from '../types/leaderboard.type';

@Entity('leaderboard_xp_events')
@Index(['userId', 'idempotencyKey'], {
  unique: true,
})
@Index(['userId', 'createdAt'])
export class LeaderboardXpEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  userId: string;

  @Column({
    type: 'enum',
    enum: LeaderboardXpSourceType,
  })
  sourceType: LeaderboardXpSourceType;

  @Column({
    type: 'varchar',
    length: 180,
    nullable: true,
  })
  sourceReference: string | null;

  @Column({
    type: 'varchar',
    length: 180,
  })
  idempotencyKey: string;

  @Column({
    type: 'integer',
    default: 0,
  })
  baseXp: number;

  @Column({
    type: 'integer',
    default: 0,
  })
  streakBonusXp: number;

  @Column({
    type: 'integer',
    default: 0,
  })
  masteryBonusXp: number;

  @Column({
    type: 'integer',
    default: 0,
  })
  speedBonusXp: number;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: '1.00',
  })
  multiplier: string;

  @Column({
    type: 'integer',
  })
  awardedXp: number;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;
}
