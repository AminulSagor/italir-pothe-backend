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

import { Lesson } from './lesson.entity';

@Entity('lesson_vocabularies')
export class LessonVocabulary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  lessonId: string;

  @Column({ name: 'italian_word', type: 'varchar', length: 180 })
  italianWord: string;

  @Column({ name: 'ai_pronunciation_file_id', type: 'uuid', nullable: true })
  aiPronunciationFileId: string | null;

  @Column({ name: 'english_meaning', type: 'varchar', length: 500 })
  englishMeaning: string;

  @Column({
    name: 'english_example',
    type: 'varchar',
    length: 700,
    nullable: true,
  })
  englishExample: string | null;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Lesson, (lesson) => lesson.vocabularyItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;
}
