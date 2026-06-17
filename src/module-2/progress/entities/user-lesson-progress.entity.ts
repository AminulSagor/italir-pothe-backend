import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_lesson_progress')
@Index(['userId', 'lessonId'], { unique: true })
export class UserLessonProgress {
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
  lessonId: string;

  @Column({ type: 'integer', default: 0 })
  videoWatchPercent: number;

  @Column({ type: 'boolean', default: false })
  isTheoryRead: boolean;

  @Column({ type: 'boolean', default: false })
  isCompleted: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
