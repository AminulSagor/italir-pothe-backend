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

import { ExamAnswerType } from '../types/final-exam.type';
import { ExamAnswerItem } from './exam-answer-item.entity';
import { ExamAttempt } from './exam-attempt.entity';
import { ExamQuestion } from './exam-question.entity';
import { ExamSection } from './exam-section.entity';

@Entity('exam_answers')
export class ExamAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  attemptId: string;

  @Index()
  @Column({ type: 'uuid' })
  sectionId: string;

  @Index()
  @Column({ type: 'uuid' })
  questionId: string;

  @Column({ type: 'varchar', length: 30 })
  answerType: ExamAnswerType;

  @Column({ type: 'uuid', nullable: true })
  selectedOptionId: string | null;

  @Column({ type: 'text', nullable: true })
  textAnswer: string | null;

  @Column({ type: 'uuid', nullable: true })
  audioFileId: string | null;

  @Column({ type: 'boolean', nullable: true })
  isCorrect: boolean | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0 })
  score: string;

  @Column({ type: 'integer', default: 0 })
  durationSeconds: number;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => ExamAttempt, (attempt) => attempt.answers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'attemptId' })
  attempt: ExamAttempt;

  @ManyToOne(() => ExamSection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sectionId' })
  section: ExamSection;

  @ManyToOne(() => ExamQuestion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'questionId' })
  question: ExamQuestion;

  @OneToMany(() => ExamAnswerItem, (item) => item.answer)
  items: ExamAnswerItem[];
}
