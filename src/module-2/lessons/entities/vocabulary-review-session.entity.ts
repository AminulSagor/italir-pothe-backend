import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from 'src/users/entities/user.entity';
import { Lesson } from './lesson.entity';
import { VocabularyReviewSessionItem } from './vocabulary-review-session-item.entity';

export enum VocabularyReviewMode {
  FULL_LESSON = 'full_lesson',
  WEAK_REVIEW = 'weak_review',
}

export enum VocabularyReviewSessionStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned',
}

@Entity('vocabulary_review_sessions')
export class VocabularyReviewSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid' })
  lessonId: string;

  @Column({
    type: 'enum',
    enum: VocabularyReviewMode,
    default: VocabularyReviewMode.FULL_LESSON,
  })
  mode: VocabularyReviewMode;

  @Column({
    type: 'enum',
    enum: VocabularyReviewSessionStatus,
    default: VocabularyReviewSessionStatus.IN_PROGRESS,
  })
  status: VocabularyReviewSessionStatus;

  @Column({ type: 'integer', default: 0 })
  totalCards: number;

  @Column({ type: 'integer', default: 0 })
  knownCount: number;

  @Column({ type: 'integer', default: 0 })
  weakCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;

  @OneToMany(() => VocabularyReviewSessionItem, (item) => item.session)
  items: VocabularyReviewSessionItem[];
}
