import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum XpBoostSource {
  DAILY_CHEST = 'daily_chest',
  PURCHASE = 'purchase',
  ADMIN = 'admin',
  PROMOTION = 'promotion',
}

@Entity('user_xp_boosts')
@Index(['userId', 'isActive'])
export class UserXpBoost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 2 })
  multiplier: number;

  @Column({
    type: 'enum',
    enum: XpBoostSource,
    default: XpBoostSource.PROMOTION,
  })
  source: XpBoostSource;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
