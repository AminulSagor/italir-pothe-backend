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

import { ExamReview } from './exam-review.entity';

@Entity('exam_review_metrics')
@Index(['reviewId'], { unique: true })
export class ExamReviewMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  reviewId: string;

  @Column({ type: 'integer', default: 0 })
  evaluationDurationMinutes: number;

  @Column({ type: 'integer', default: 0 })
  scoreReliabilityPercent: number;

  @Column({ type: 'timestamptz' })
  gradedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => ExamReview, (review) => review.metric, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'reviewId' })
  review: ExamReview;
}
