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
import {
  CourseDeviceAuthorizationStatus,
  CourseDevicePlatform,
} from '../enums/course-device-access.enums';

@Entity('course_device_authorizations')
@Index(
  'UQ_course_device_authorization_device',
  ['userId', 'courseId', 'deviceKeyId'],
  {
    unique: true,
  },
)
@Index('IDX_course_device_authorization_active', [
  'userId',
  'courseId',
  'status',
])
export class CourseDeviceAuthorization {
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

  @Column({ type: 'varchar', length: 180 })
  deviceKeyId: string;

  @Column({ type: 'varchar', length: 160 })
  deviceLabel: string;

  @Column({ type: 'enum', enum: CourseDevicePlatform })
  platform: CourseDevicePlatform;

  @Column({ type: 'enum', enum: CourseDeviceAuthorizationStatus })
  status: CourseDeviceAuthorizationStatus;

  @Column({ type: 'text' })
  publicKeyPem: string;

  @Column({ type: 'text', nullable: true })
  attestationReceipt: string | null;

  @Column({ type: 'integer', default: 0 })
  assertionCounter: number;

  @Column({ type: 'timestamptz', nullable: true })
  activatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastVerifiedAt: Date | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  accessTokenHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  accessTokenExpiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
