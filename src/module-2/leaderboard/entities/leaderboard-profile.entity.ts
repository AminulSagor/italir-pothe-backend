import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('leaderboard_profiles')
@Index(['userId'], { unique: true })
@Index(['totalXp'])
@Index(['displayName'])
export class LeaderboardProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  userId: string;

  @Column({
    type: 'varchar',
    length: 160,
  })
  displayName: string;

  @Column({
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  username: string | null;

  @Column({
    type: 'varchar',
    length: 600,
    nullable: true,
  })
  avatarUrl: string | null;

  @Column({
    type: 'integer',
    default: 0,
  })
  totalXp: number;

  @Column({
    type: 'integer',
    default: 0,
  })
  streakDays: number;

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
    type: 'timestamptz',
    nullable: true,
  })
  lastActivityAt: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
