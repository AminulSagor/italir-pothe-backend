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
import { CourseChapter } from '../../syllabus/entities/course-chapter.entity';
import { LessonVocabulary } from './lesson-vocabulary.entity';
import { Quiz } from 'src/module-2/quizzes/entities/quiz.entity';

export enum LessonStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Entity('lessons')
@Index(['chapterId', 'slug'], { unique: true })
export class Lesson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  courseId: string;

  @Index()
  @Column({ type: 'uuid' })
  chapterId: string;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'varchar', length: 220 })
  slug: string;

  @Column({ type: 'uuid', nullable: true })
  videoFileId: string | null;

  @Column({ type: 'text', nullable: true })
  theoryText: string | null;

  @Column({ type: 'uuid', nullable: true })
  theoryAudioFileId: string | null;

  @Column({ type: 'text', nullable: true })
  bengaliTranslation: string | null;

  @Column({ type: 'uuid', nullable: true })
  supplementaryMaterialFileId: string | null;

  @Column({ type: 'boolean', default: true })
  isFree: boolean;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: LessonStatus.DRAFT,
  })
  status: LessonStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Course, (course) => course.lessons, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @ManyToOne(() => CourseChapter, (chapter) => chapter.lessons, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'chapterId' })
  chapter: CourseChapter;

  @OneToMany(() => LessonVocabulary, (vocabulary) => vocabulary.lesson)
  vocabularyItems: LessonVocabulary[];

  @OneToMany(() => Quiz, (quiz) => quiz.lesson)
  quizzes: Quiz[];
}
