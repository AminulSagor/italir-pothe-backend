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

import { User } from 'src/users/entities/user.entity';
import { Lesson } from './lesson.entity';
import { LessonVocabulary } from './lesson-vocabulary.entity';

export enum VocabularyMasteryStatus {
  NEW = 'new',
  LEARNING = 'learning',
  WEAK = 'weak',
  KNOWN = 'known',
  MASTERED = 'mastered',
}

export enum VocabularyReviewChoice {
  KNOWN = 'known',
  STUDY_AGAIN = 'study_again',
}

@Entity('user_vocabulary_progress')
@Index(['userId', 'vocabularyId'], { unique: true })
export class UserVocabularyProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid' })
  lessonId: string;

  @Index()
  @Column({ type: 'uuid' })
  vocabularyId: string;

  @Column({ type: 'integer', default: 0 })
  knownCount: number;

  @Column({ type: 'integer', default: 0 })
  studyAgainCount: number;

  @Column({
    type: 'enum',
    enum: VocabularyReviewChoice,
    nullable: true,
  })
  lastChoice: VocabularyReviewChoice | null;

  @Column({
    type: 'enum',
    enum: VocabularyMasteryStatus,
    default: VocabularyMasteryStatus.NEW,
  })
  masteryStatus: VocabularyMasteryStatus;

  @Column({ type: 'timestamptz', nullable: true })
  lastReviewedAt: Date | null;

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

  @ManyToOne(() => LessonVocabulary, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vocabularyId' })
  vocabulary: LessonVocabulary;
}
