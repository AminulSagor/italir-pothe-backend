import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_course_progress')
@Index(['userId', 'courseId'], { unique: true })
export class UserCourseProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid' })
  courseId: string;

  @Column({ type: 'integer', default: 0 })
  completedLessons: number;

  @Column({ type: 'integer', default: 0 })
  totalLessons: number;

  @Column({ type: 'integer', default: 0 })
  completionPercent: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastActivityAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
