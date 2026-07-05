import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum LearningTimeActivityType {
  COURSE = 'course',
  LESSON = 'lesson',
  QUIZ = 'quiz',
  EXAM = 'exam',
  PDF = 'pdf',
  VOCABULARY = 'vocabulary',
  PRACTICE_HUB = 'practice_hub',
  JOB_SENTENCES = 'job_sentences',
  SURVIVAL_ITALIAN = 'survival_italian',
  IMPORTANT_VERBS = 'important_verbs',
  AI_TUTOR = 'ai_tutor',
  WEBINAR = 'webinar',
}

@Entity('user_learning_activity_time_entries')
@Index(['userId', 'eventId'], { unique: true })
@Index(['userId', 'activityDate'])
export class UserLearningActivityTimeEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  eventId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'date' })
  activityDate: string;

  @Column({ type: 'varchar', length: 40 })
  activityType: LearningTimeActivityType;

  @Column({ type: 'varchar', length: 180, nullable: true })
  sourceId: string | null;

  @Column({ type: 'integer' })
  durationSeconds: number;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz' })
  endedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
