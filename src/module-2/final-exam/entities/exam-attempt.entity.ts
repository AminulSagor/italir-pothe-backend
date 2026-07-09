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

import { Course } from 'src/module-2/courses/entities/course.entity';
import { User } from 'src/users/entities/user.entity';
import { ExamAttemptStatus } from '../types/final-exam.type';
import { ExamAnswer } from './exam-answer.entity';
import { ExamReview } from './exam-review.entity';
import { ExamTemplate } from './exam-template.entity';

@Entity('exam_attempts')
export class ExamAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  courseId: string | null;

  @Index()
  @Column({ type: 'uuid' })
  examTemplateId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  referenceCode: string;

  @Column({
    type: 'varchar',
    length: 40,
    default: ExamAttemptStatus.IN_PROGRESS,
  })
  status: ExamAttemptStatus;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'integer', default: 0 })
  totalDurationSeconds: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => User, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({
    name: 'userId',
  })
  user: User | null;

  @ManyToOne(() => Course, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'courseId' })
  course: Course | null;

  @ManyToOne(() => ExamTemplate, (template) => template.attempts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'examTemplateId' })
  examTemplate: ExamTemplate;

  @OneToMany(() => ExamAnswer, (answer) => answer.attempt)
  answers: ExamAnswer[];

  @OneToOne(() => ExamReview, (review) => review.attempt)
  review: ExamReview;
}
