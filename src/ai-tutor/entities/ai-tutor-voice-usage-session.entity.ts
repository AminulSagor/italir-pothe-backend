import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AiTutorVoiceUsageStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  ENDED = 'ended',
  CANCELLED = 'cancelled',
}

@Entity('ai_tutor_voice_usage_sessions')
@Index('IDX_ai_tutor_voice_usage_user_created', ['userId', 'createdAt'])
export class AiTutorVoiceUsageSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  providerSessionId: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: AiTutorVoiceUsageStatus.PENDING,
  })
  status: AiTutorVoiceUsageStatus;

  @Column({ type: 'integer' })
  allocatedSeconds: number;

  @Column({ type: 'integer', default: 0 })
  usedSeconds: number;

  @Column({ type: 'timestamptz', nullable: true })
  connectedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastHeartbeatAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
