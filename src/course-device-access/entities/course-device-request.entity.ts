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

import { Course } from '../../module-2/courses/entities/course.entity';
import { User } from '../../users/entities/user.entity';
import { CourseDeviceAuthorization } from './course-device-authorization.entity';
import { CourseDeviceRequestStatus } from '../enums/course-device-access.enums';

@Entity('course_device_requests')
@Index('IDX_course_device_requests_status_created', ['status', 'createdAt'])
@Index(
  'UQ_course_device_pending_request',
  ['userId', 'courseId', 'requestedAuthorizationId'],
  {
    unique: true,
    where: `"status" = 'pending'`,
  },
)
export class CourseDeviceRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  courseId: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @Column({ type: 'uuid', nullable: true })
  currentAuthorizationId: string | null;

  @ManyToOne(() => CourseDeviceAuthorization, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'currentAuthorizationId' })
  currentAuthorization: CourseDeviceAuthorization | null;

  @Column({ type: 'uuid' })
  requestedAuthorizationId: string;

  @ManyToOne(() => CourseDeviceAuthorization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requestedAuthorizationId' })
  requestedAuthorization: CourseDeviceAuthorization;

  @Column({ type: 'enum', enum: CourseDeviceRequestStatus })
  status: CourseDeviceRequestStatus;

  @Column({ type: 'uuid', nullable: true })
  decidedByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
