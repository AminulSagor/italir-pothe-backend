import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  ExamReviewMode,
  ExamSectionStatus,
  ExamSectionType,
} from '../types/final-exam.type';
import { ExamQuestion } from './exam-question.entity';
import { ExamSectionRule } from './exam-section-rule.entity';
import { ExamTemplate } from './exam-template.entity';

@Entity('exam_sections')
export class ExamSection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  examTemplateId: string;

  @Column({ type: 'varchar', length: 40 })
  sectionType: ExamSectionType;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'varchar', length: 220, nullable: true })
  subtitle: string | null;

  @Column({ type: 'varchar', length: 20 })
  reviewMode: ExamReviewMode;

  @Column({ type: 'integer', default: 0 })
  questionCount: number;

  @Column({ type: 'integer', default: 0 })
  targetQuestionCount: number;

  @Column({ type: 'integer', default: 0 })
  passingPercent: number;

  @Column({ type: 'integer', nullable: true })
  timeLimitSeconds: number | null;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: ExamSectionStatus.DRAFT,
  })
  status: ExamSectionStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => ExamTemplate, (template) => template.sections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'examTemplateId' })
  examTemplate: ExamTemplate;

  @OneToOne(() => ExamSectionRule, (rule) => rule.section)
  rule: ExamSectionRule;

  @OneToMany(() => ExamQuestion, (question) => question.section)
  questions: ExamQuestion[];
}
