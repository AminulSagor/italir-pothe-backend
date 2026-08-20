import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AiTutorLiveSessionStatus {
  ACTIVE = 'active',
  FINALIZING = 'finalizing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface AiTutorTranscriptEvent {
  eventId: string;
  role: 'user' | 'assistant';
  text: string;
  occurredAt: string;
}

@Entity('ai_tutor_live_sessions')
@Index('IDX_ai_tutor_live_sessions_user_created', ['userId', 'createdAt'])
@Index('IDX_ai_tutor_live_sessions_summary_due', [
  'status',
  'summaryLeaseUntil',
])
export class AiTutorLiveSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  usageSessionId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 160 })
  model: string;

  @Column({ type: 'varchar', length: 20, default: 'assisted' })
  mode: string;

  @Column({ type: 'varchar', length: 8, nullable: true })
  guidedLevel: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  topic: string | null;

  @Column({ type: 'varchar', length: 20 })
  status: AiTutorLiveSessionStatus;

  @Column({ type: 'integer', default: 0 })
  activeSeconds: number;

  @Column({ type: 'integer', default: 0 })
  lastSummarizedActiveSeconds: number;

  @Column({ type: 'integer', default: 0 })
  summaryVersion: number;

  @Column({ type: 'integer', default: 0 })
  summaryAttemptCount: number;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  rollingSummary: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  pendingTranscript: AiTutorTranscriptEvent[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  processedEventIds: string[];

  @Column({ type: 'text', nullable: true })
  resumptionHandle: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSummaryAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  summaryLeaseUntil: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  finalSummary: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  summaryError: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
