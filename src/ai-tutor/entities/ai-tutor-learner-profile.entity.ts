import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';

@Entity('ai_tutor_learner_profiles')
export class AiTutorLearnerProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', unique: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 8, default: 'A1' })
  speakingLevel: string;

  @Column({ type: 'varchar', length: 8, default: 'A1' })
  vocabularyLevel: string;

  @Column({ type: 'varchar', length: 8, default: 'A1' })
  grammarLevel: string;

  @Column({ type: 'varchar', length: 8, default: 'A1' })
  finalLevel: string;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  strengths: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  focusAreas: string[];

  @Column({ type: 'int', default: 1 })
  attemptCount: number;

  @Column({ type: 'timestamptz' })
  completedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
