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
import { QuizAttemptAnswerItem } from './quiz-attempt-answer-item.entity';
import { QuizQuestion } from './quiz-question.entity';
import { QuizSession } from './quiz-session.entity';

@Entity('quiz_attempt_answers')
export class QuizAttemptAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  sessionId: string;

  @Index()
  @Column({ type: 'uuid' })
  questionId: string;

  @Column({
    type: 'enum',
    enum: QuizQuestionFormat,
  })
  questionType: QuizQuestionFormat;

  @Column({ type: 'boolean', default: false })
  isCorrect: boolean;

  @Column({ type: 'integer', default: 0 })
  pointsEarned: number;

  @Column({ type: 'integer', nullable: true })
  timeSpentSeconds: number | null;

  @Column({ type: 'text', nullable: true })
  writtenAnswer: string | null;

  @Column({ type: 'uuid', nullable: true })
  selectedOptionId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => QuizSession, (session) => session.answers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session: QuizSession;

  @ManyToOne(() => QuizQuestion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'questionId' })
  question: QuizQuestion;

  @OneToMany(() => QuizAttemptAnswerItem, (item) => item.answer)
  items: QuizAttemptAnswerItem[];
}
