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

import { QuizQuestionFormat } from 'src/module-2/quizzes/types/quiz-question-format.type';
import {
  ExamAudioSourceType,
  ExamQuestionStatus,
} from '../types/final-exam.type';
import { ExamMatchingPair } from './exam-matching-pair.entity';
import { ExamQuestionOption } from './exam-question-option.entity';
import { ExamSection } from './exam-section.entity';
import { ExamSequenceItem } from './exam-sequence-item.entity';
import { ExamAcceptedAnswer } from './exam-accepted-answer.entity';

@Entity('exam_questions')
export class ExamQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  sectionId: string;

  @Column({ type: 'varchar', length: 50 })
  questionFormat: QuizQuestionFormat;

  @Column({ type: 'varchar', length: 180, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 220, nullable: true })
  subtitle: string | null;

  @Column({ type: 'text', nullable: true })
  prompt: string | null;

  @Column({ type: 'text', nullable: true })
  promptBn: string | null;

  @Column({ type: 'uuid', nullable: true })
  audioFileId: string | null;

  @Column({ type: 'uuid', nullable: true })
  imageFileId: string | null;

  @Column({ type: 'boolean', nullable: true })
  correctBoolean: boolean | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: ExamAudioSourceType.MANUAL_UPLOAD,
  })
  audioSourceType: ExamAudioSourceType;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: ExamQuestionStatus.DRAFT,
  })
  status: ExamQuestionStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => ExamSection, (section) => section.questions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sectionId' })
  section: ExamSection;

  @OneToMany(() => ExamQuestionOption, (option) => option.question)
  options: ExamQuestionOption[];

  @OneToMany(() => ExamMatchingPair, (pair) => pair.question)
  pairs: ExamMatchingPair[];

  @OneToMany(() => ExamSequenceItem, (item) => item.question)
  sequenceItems: ExamSequenceItem[];

  @OneToMany(() => ExamAcceptedAnswer, (answer) => answer.question)
  acceptedAnswers: ExamAcceptedAnswer[];
}
