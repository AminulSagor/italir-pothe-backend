import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_job_sentence_progress')
@Index(['userId', 'sentenceId'], { unique: true })
export class UserJobSentenceProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid' })
  careerTrackId: string;

  @Index()
  @Column({ type: 'uuid' })
  moduleId: string;

  @Index()
  @Column({ type: 'uuid' })
  sentenceId: string;

  @Column({ type: 'integer', default: 1 })
  reviewCount: number;

  @Column({ type: 'boolean', default: true })
  isLearned: boolean;

  @Column({ type: 'timestamptz' })
  learnedAt: Date;

  @Column({ type: 'timestamptz' })
  lastReviewedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
