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

@Entity('exam_accepted_answers')
export class ExamAcceptedAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  questionId: string;

  @Column({ type: 'varchar', length: 255 })
  answerText: string;

  @Column({ type: 'boolean', default: true })
  ignoreCase: boolean;

  @Column({ type: 'boolean', default: true })
  ignorePunctuation: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => ExamQuestion, (question) => question.acceptedAnswers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'questionId' })
  question: ExamQuestion;
}
