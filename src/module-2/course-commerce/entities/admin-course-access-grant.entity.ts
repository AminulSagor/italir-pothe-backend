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

import { Course } from '../../courses/entities/course.entity';
import { User } from '../../../users/entities/user.entity';
import {
  AdminExternalPaymentMethod,
  CommerceCurrency,
} from '../types/course-commerce.type';
import { CourseEnrollment } from './course-enrollment.entity';

export enum AdminCourseAccessGrantStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
}

@Entity('admin_course_access_grants')
@Index(['externalReference'], { unique: true })
@Index(['userId', 'courseId'])
export class AdminCourseAccessGrant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid' })
  courseId: string;

  @Index()
  @Column({ type: 'uuid' })
  enrollmentId: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  paymentAmount: string;

  @Column({ type: 'varchar', length: 3 })
  paymentCurrency: CommerceCurrency;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amountEur: string;

  @Column({ type: 'varchar', length: 40 })
  paymentMethod: AdminExternalPaymentMethod;

  @Column({ type: 'varchar', length: 255 })
  externalReference: string;

  @Column({ type: 'timestamptz' })
  paidAt: Date;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 20 })
  status: AdminCourseAccessGrantStatus;

  @Column({ type: 'uuid' })
  grantedByAdminId: string;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  revokedByAdminId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  revokeReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => User, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @ManyToOne(() => Course, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @ManyToOne(
    () => CourseEnrollment,
    (enrollment) => enrollment.externalGrants,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'enrollmentId' })
  enrollment: CourseEnrollment;
}
