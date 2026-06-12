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

@Entity('quiz_matching_pairs')
export class QuizMatchingPair {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  questionId: string;

  @Column({ type: 'varchar', length: 180 })
  leftText: string;

  @Column({ type: 'varchar', length: 180 })
  rightText: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  leftLabel: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  rightLabel: string | null;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => QuizQuestion, (question) => question.pairs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'questionId' })
  question: QuizQuestion;
}
