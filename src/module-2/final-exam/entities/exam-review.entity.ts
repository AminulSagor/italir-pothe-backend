import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ExamVerdict } from '../types/final-exam.type';
import { ExamAttempt } from './exam-attempt.entity';
import { ExamReviewMetric } from './exam-review-metric.entity';

@Entity('exam_reviews')
@Index(['attemptId'], { unique: true })
export class ExamReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  attemptId: string;

  @Column({ type: 'uuid' })
  reviewedById: string;

  @Column({ type: 'integer', default: 0 })
  vocabularyUsageScore: number;

  @Column({ type: 'integer', default: 0 })
  grammarAccuracyScore: number;

  @Column({ type: 'integer', default: 0 })
  fluencyPronunciationScore: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  writingScore: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  speakingScore: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  finalAverageScore: string;

  @Column({ type: 'text', nullable: true })
  teacherComment: string | null;

  @Column({ type: 'text', nullable: true })
  teacherCommentBn: string | null;

  @Column({ type: 'text', nullable: true })
  keyStrength: string | null;

  @Column({ type: 'text', nullable: true })
  criticalGap: string | null;

  @Column({ type: 'varchar', length: 30 })
  verdict: ExamVerdict;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => ExamAttempt, (attempt) => attempt.review, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'attemptId' })
  attempt: ExamAttempt;

  @OneToOne(() => ExamReviewMetric, (metric) => metric.review)
  metric: ExamReviewMetric;
}
