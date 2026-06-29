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

import { User } from 'src/users/entities/user.entity';
import { Course } from '../../courses/entities/course.entity';
import {
  CourseAccessType,
  CourseEnrollmentStatus,
} from '../types/course-commerce.type';
import { CoursePurchaseOrder } from './course-purchase-order.entity';

@Entity('course_enrollments')
@Index(['userId', 'courseId'], {
  unique: true,
})
export class CourseEnrollment {
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
  orderId: string;

  @Column({
    type: 'enum',
    enum: CourseEnrollmentStatus,
    default: CourseEnrollmentStatus.ACTIVE,
  })
  status: CourseEnrollmentStatus;

  @Column({
    type: 'enum',
    enum: CourseAccessType,
    default: CourseAccessType.LIFETIME,
  })
  accessType: CourseAccessType;

  @Column({ type: 'timestamptz' })
  enrolledAt: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  expiresAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  refundedAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  lastAccessedAt: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @ManyToOne(() => User, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({
    name: 'userId',
  })
  user: User | null;

  @ManyToOne(() => Course, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @ManyToOne(() => CoursePurchaseOrder, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'orderId' })
  order: CoursePurchaseOrder;
}
