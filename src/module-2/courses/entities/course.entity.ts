import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { CourseChapter } from 'src/module-2/syllabus/entities/course-chapter.entity';
import { Lesson } from '../../lessons/entities/lesson.entity';

export enum CourseStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  UPCOMING = 'upcoming',
  ARCHIVED = 'archived',
}

@Entity('courses')
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'varchar', length: 220, nullable: true })
  subtitle: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 220 })
  slug: string;

  @Column({ type: 'boolean', default: true })
  isFree: boolean;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  price: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  couponCode: string | null;

  @Column({ type: 'uuid', nullable: true })
  finalExamTemplateId: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: CourseStatus.DRAFT,
  })
  status: CourseStatus;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => CourseChapter, (chapter) => chapter.course)
  chapters: CourseChapter[];

  @OneToMany(() => Lesson, (lesson) => lesson.course)
  lessons: Lesson[];
}
