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

import { User } from 'src/users/entities/user.entity';
import { Lesson } from '../../lessons/entities/lesson.entity';
import { Quiz } from './quiz.entity';
import { QuizAttemptAnswer } from './quiz-attempt-answer.entity';

export enum QuizSessionStatus {
  IN_PROGRESS = 'in_progress',
  SUBMITTED = 'submitted',
  CANCELLED = 'cancelled',
}

@Entity('quiz_sessions')
export class QuizSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid' })
  quizId: string;

  @Index()
  @Column({ type: 'uuid' })
  lessonId: string;

  @Column({
    type: 'enum',
    enum: QuizSessionStatus,
    default: QuizSessionStatus.IN_PROGRESS,
  })
  status: QuizSessionStatus;

  @Column({ type: 'integer', default: 0 })
  totalQuestions: number;

  @Column({ type: 'integer', default: 0 })
  correctAnswers: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0 })
  score: number;

  @Column({ type: 'integer', default: 0 })
  earnedXp: number;

  @Column({ type: 'integer', default: 0 })
  timeTakenSeconds: number;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => User, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({
    name: 'userId',
  })
  user: User | null;

  @ManyToOne(() => Quiz, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quizId' })
  quiz: Quiz;

  @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;

  @OneToMany(() => QuizAttemptAnswer, (answer) => answer.session)
  answers: QuizAttemptAnswer[];
}
