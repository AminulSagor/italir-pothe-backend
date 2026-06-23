import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { LeagueKey } from '../types/leaderboard.type';

@Entity('league_promotion_events')
@Index(['userId', 'isAcknowledged'])
export class LeaguePromotionEvent {
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
  fromLeague: LeagueKey;

  @Column({
    type: 'enum',
    enum: LeagueKey,
  })
  toLeague: LeagueKey;

  @Column({
    type: 'integer',
  })
  totalXp: number;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: '1.00',
  })
  xpBoostMultiplier: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  xpBoostExpiresAt: Date | null;

  @Column({
    type: 'boolean',
    default: false,
  })
  isAcknowledged: boolean;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  acknowledgedAt: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
