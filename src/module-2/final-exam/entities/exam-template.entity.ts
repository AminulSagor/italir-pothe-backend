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

import { Course } from 'src/module-2/courses/entities/course.entity';
import { ExamTemplateStatus } from '../types/final-exam.type';
import { ExamAttempt } from './exam-attempt.entity';
import { ExamSection } from './exam-section.entity';

@Entity('exam_templates')
export class ExamTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  courseId: string | null;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: ExamTemplateStatus.DRAFT,
  })
  status: ExamTemplateStatus;

  @Column({ type: 'integer', default: 70 })
  overallPassingPercent: number;

  @Column({ type: 'integer', default: 60 })
  totalDurationMinutes: number;

  @Column({ type: 'integer', default: 80 })
  unlockCompletionPercent: number;

  @Column({ type: 'boolean', default: true })
  plagiarismMonitorEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  copyPasteMonitorEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  resultNotice: string | null;

  @Column({ type: 'text', nullable: true })
  resultNoticeBn: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Course, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'courseId' })
  course: Course | null;

  @OneToMany(() => ExamSection, (section) => section.examTemplate)
  sections: ExamSection[];

  @OneToMany(() => ExamAttempt, (attempt) => attempt.examTemplate)
  attempts: ExamAttempt[];
}
