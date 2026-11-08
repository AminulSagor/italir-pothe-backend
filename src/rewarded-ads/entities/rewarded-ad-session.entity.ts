import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  RewardedPlacement,
  RewardedSessionStatus,
} from '../types/rewarded-ad.type';

@Entity('rewarded_ad_sessions')
@Index(['userId', 'createdAt'])
export class RewardedAdSession {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'enum', enum: RewardedPlacement })
  placement: RewardedPlacement;
  @Column({ type: 'varchar', length: 120, nullable: true }) contextId:
    | string
    | null;
  @Column({
    type: 'enum',
    enum: RewardedSessionStatus,
    default: RewardedSessionStatus.PENDING,
  })
  status: RewardedSessionStatus;
  @Index({ unique: true, where: '"transactionId" IS NOT NULL' })
  @Column({ type: 'varchar', length: 160, nullable: true })
  transactionId: string | null;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) verifiedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) grantedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
