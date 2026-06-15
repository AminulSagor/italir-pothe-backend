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

import { LessonVocabulary } from './lesson-vocabulary.entity';
import { VocabularyReviewChoice } from './user-vocabulary-progress.entity';
import { VocabularyReviewSession } from './vocabulary-review-session.entity';

@Entity('vocabulary_review_session_items')
@Index(['sessionId', 'vocabularyId'], { unique: true })
export class VocabularyReviewSessionItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  sessionId: string;

  @Index()
  @Column({ type: 'uuid' })
  vocabularyId: string;

  @Column({
    type: 'enum',
    enum: VocabularyReviewChoice,
  })
  choice: VocabularyReviewChoice;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @Column({ type: 'timestamptz' })
  answeredAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => VocabularyReviewSession, (session) => session.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session: VocabularyReviewSession;

  @ManyToOne(() => LessonVocabulary, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vocabularyId' })
  vocabulary: LessonVocabulary;
}
