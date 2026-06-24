import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { LeagueKey } from '../types/leaderboard.type';

@Entity('league_definitions')
@Index(['key'], { unique: true })
export class LeagueDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: LeagueKey,
  })
  key: LeagueKey;

  @Column({
    type: 'varchar',
    length: 80,
  })
  name: string;

  @Column({
    type: 'integer',
  })
  minXp: number;

  @Column({
    type: 'integer',
    nullable: true,
  })
  maxXp: number | null;

  @Column({
    type: 'varchar',
    length: 80,
  })
  iconKey: string;

  @Column({
    type: 'varchar',
    length: 80,
  })
  themeKey: string;

  @Column({
    type: 'smallint',
  })
  sortOrder: number;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: '1.00',
  })
  xpBoostMultiplier: string;

  @Column({
    type: 'integer',
    default: 0,
  })
  xpBoostDurationHours: number;

  @Column({
    type: 'boolean',
    default: true,
  })
  isActive: boolean;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
