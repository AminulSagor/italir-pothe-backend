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

import { QuizQuestionFormat } from '../types/quiz-question-format.type';
import { Quiz } from './quiz.entity';
import { QuizMatchingPair } from './quiz-matching-pair.entity';
import { QuizQuestionOption } from './quiz-question-option.entity';
import { QuizSequenceItem } from './quiz-sequence-item.entity';
import { QuizAcceptedAnswer } from './quiz-accepted-answer.entity';

export enum QuizQuestionStatus {
  ACTIVE = 'active',
  DRAFT = 'draft',
  ARCHIVED = 'archived',
}

@Entity('quiz_questions')
export class QuizQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  quizId: string;

  @Column({
    type: 'enum',
    enum: QuizQuestionFormat,
  })
  questionType: QuizQuestionFormat;

  @Column({ type: 'varchar', length: 180, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  promptText: string | null;

  @Column({ type: 'text', nullable: true })
  helperText: string | null;

  @Column({ type: 'text', nullable: true })
  translationText: string | null;

  @Column({ type: 'uuid', nullable: true })
  mediaFileId: string | null;

  @Column({ type: 'text', nullable: true })
  generatedAudioText: string | null;

  @Column({ type: 'integer', default: 1 })
  points: number;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @Column({
    type: 'enum',
    enum: QuizQuestionStatus,
    default: QuizQuestionStatus.DRAFT,
  })
  status: QuizQuestionStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Quiz, (quiz) => quiz.questions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'quizId' })
  quiz: Quiz;

  @OneToMany(() => QuizQuestionOption, (option) => option.question)
  options: QuizQuestionOption[];

  @OneToMany(() => QuizMatchingPair, (pair) => pair.question)
  pairs: QuizMatchingPair[];

  @OneToMany(() => QuizSequenceItem, (item) => item.question)
  sequenceItems: QuizSequenceItem[];

  @OneToMany(() => QuizAcceptedAnswer, (answer) => answer.question)
  acceptedAnswers: QuizAcceptedAnswer[];
}
