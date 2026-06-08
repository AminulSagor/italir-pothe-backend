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

import { File } from 'src/files/entities/file.entity';
import { Course } from 'src/module-2/courses/entities/course.entity';
import { ExamAttempt } from 'src/module-2/final-exam/entities/exam-attempt.entity';
import { User } from 'src/users/entities/user.entity';

export enum CertificateStatus {
  ISSUED = 'issued',
  REVOKED = 'revoked',
}

@Entity('certificates')
@Index(['certificateNumber'], { unique: true })
@Index(['examAttemptId'], { unique: true })
export class Certificate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  courseId: string;

  @Column({ type: 'uuid' })
  examAttemptId: string;

  @Column({ type: 'varchar', length: 80 })
  certificateNumber: string;

  @Column({ type: 'uuid', nullable: true })
  pdfFileId: string | null;

  @Column({
    type: 'enum',
    enum: CertificateStatus,
    default: CertificateStatus.ISSUED,
  })
  status: CertificateStatus;

  @Column({ type: 'timestamptz' })
  issuedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @ManyToOne(() => ExamAttempt, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'examAttemptId' })
  examAttempt: ExamAttempt;

  @ManyToOne(() => File, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'pdfFileId' })
  pdfFile: File | null;
}
