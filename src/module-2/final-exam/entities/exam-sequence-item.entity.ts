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

@Entity('exam_sequence_items')
export class ExamSequenceItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  questionId: string;

  @Column({ type: 'varchar', length: 180 })
  itemText: string;

  @Column({ type: 'boolean', default: false })
  isDecoy: boolean;

  @Column({ type: 'integer', default: 0 })
  correctOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => ExamQuestion, (question) => question.sequenceItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'questionId' })
  question: ExamQuestion;
}
