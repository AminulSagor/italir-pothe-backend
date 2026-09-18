import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Course } from '../../module-2/courses/entities/course.entity';
import { User } from '../../users/entities/user.entity';
import { CourseDevicePlatform } from '../enums/course-device-access.enums';

@Entity('course_device_challenges')
@Index('IDX_course_device_challenge_lookup', ['id', 'userId', 'courseId'])
@Index('IDX_course_device_challenge_expiry', ['expiresAt'])
export class CourseDeviceChallenge {
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

  @Column({ type: 'enum', enum: CourseDevicePlatform })
  platform: CourseDevicePlatform;

  @Column({ type: 'varchar', length: 180 })
  deviceKeyId: string;

  @Column({ type: 'varchar', length: 160 })
  deviceLabel: string;

  @Column({ type: 'varchar', length: 128 })
  challengeHash: string;

  @Column({ type: 'text' })
  clientDataBase64: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
