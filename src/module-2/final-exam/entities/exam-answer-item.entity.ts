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

import { ExamAnswer } from './exam-answer.entity';

@Entity('exam_answer_items')
export class ExamAnswerItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  answerId: string;

  @Column({ type: 'uuid', nullable: true })
  selectedItemId: string | null;

  @Column({ type: 'uuid', nullable: true })
  matchedWithItemId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  textValue: string | null;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => ExamAnswer, (answer) => answer.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'answerId' })
  answer: ExamAnswer;
}
