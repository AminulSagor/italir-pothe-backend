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

import { QuizAttemptAnswer } from './quiz-attempt-answer.entity';

@Entity('quiz_attempt_answer_items')
export class QuizAttemptAnswerItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  attemptAnswerId: string;

  @Column({ type: 'uuid', nullable: true })
  optionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  pairId: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  answerText: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  matchedText: string | null;

  @Column({ type: 'integer', nullable: true })
  sequenceOrder: number | null;

  @Column({ type: 'boolean', default: false })
  isSelected: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => QuizAttemptAnswer, (answer) => answer.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'attemptAnswerId' })
  answer: QuizAttemptAnswer;
}
