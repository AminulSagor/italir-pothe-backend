import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('ai_tutor_learning_memories')
export class AiTutorLearningMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  memory: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  lastSessionId: string | null;

  @Column({ type: 'integer', default: 0 })
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
