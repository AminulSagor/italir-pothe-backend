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

import { QuizQuestion } from './quiz-question.entity';

@Entity('quiz_question_options')
export class QuizQuestionOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  questionId: string;

  @Column({ type: 'varchar', length: 255 })
  optionText: string;

  @Column({ type: 'boolean', default: false })
  isCorrect: boolean;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => QuizQuestion, (question) => question.options, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'questionId' })
  question: QuizQuestion;
}
