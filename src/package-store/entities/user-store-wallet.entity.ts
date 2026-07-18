import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_store_wallets')
export class UserStoreWallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({
    unique: true,
  })
  @Column({
    type: 'uuid',
  })
  userId: string;

  @Column({
    type: 'integer',
    default: 0,
  })
  aiVoiceMinutes: number;

  @Column({
    type: 'integer',
    default: 0,
  })
  aiVoiceSeconds: number;

  @Column({
    type: 'integer',
    default: 0,
  })
  aiTextTokens: number;

  @Column({
    type: 'integer',
    default: 0,
  })
  cvCredits: number;

  @Column({
    type: 'integer',
    default: 0,
  })
  freeCvGenerationsRemaining: number;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  freeCvGenerationsGrantedAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  signupCvCreditsGrantedAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  unlimitedStreakProtectionUntil: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
