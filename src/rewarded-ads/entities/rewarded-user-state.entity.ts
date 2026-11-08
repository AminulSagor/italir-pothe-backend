import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('rewarded_user_states')
export class RewardedUserState {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) counters: Record<
    string,
    number
  >;
  @Column({ type: 'integer', default: 0 }) outgoingCallsUsed: number;
  @Column({ type: 'integer', default: 0 }) callCredits: number;
  @Column({ type: 'date', nullable: true }) dailyBonusDate: string | null;
  @Column({ type: 'integer', default: 0 }) dailyBonusCount: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
