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

import { ExamQuestion } from './exam-question.entity';

@Entity('exam_matching_pairs')
export class ExamMatchingPair {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  questionId: string;

  @Column({ type: 'varchar', length: 255 })
  leftText: string;

  @Column({ type: 'varchar', length: 255 })
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

  @ManyToOne(() => ExamQuestion, (question) => question.pairs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'questionId' })
  question: ExamQuestion;
}
