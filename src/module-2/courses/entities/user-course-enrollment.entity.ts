import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { Course } from './course.entity';

@Entity('user_course_enrollments')
@Index('UQ_user_course_enrollments_user_course', ['userId', 'courseId'], {
  unique: true,
})
export class UserCourseEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({
    name: 'userId',
  })
  user: User | null;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => Course, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'courseId' })
  course: Course | null;

  @Column({ type: 'uuid', nullable: true })
  courseId: string | null;

  @Column({ type: 'varchar', length: 50 })
  status: string;

  @CreateDateColumn({ type: 'timestamptz' })
  enrolledAt: Date;
}
