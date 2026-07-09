import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Course } from '../../courses/entities/course.entity';
import { Lesson } from '../../lessons/entities/lesson.entity';

@Entity('course_chapters')
export class CourseChapter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  courseId: string | null;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isPublished: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Course, (course) => course.chapters, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'courseId' })
  course: Course | null;

  @OneToMany(() => Lesson, (lesson) => lesson.chapter)
  lessons: Lesson[];
}
