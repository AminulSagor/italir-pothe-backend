import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ExamRetakePolicy } from '../types/final-exam.type';
import { ExamSection } from './exam-section.entity';

@Entity('exam_section_rules')
@Index(['sectionId'], { unique: true })
export class ExamSectionRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sectionId: string;

  @Column({ type: 'boolean', default: false })
  playbackLocked: boolean;

  @Column({ type: 'boolean', default: false })
  accentBarEnabled: boolean;

  @Column({ type: 'integer', nullable: true })
  minWords: number | null;

  @Column({ type: 'integer', nullable: true })
  maxWords: number | null;

  @Column({ type: 'integer', nullable: true })
  maxDurationSeconds: number | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: ExamRetakePolicy.UNLIMITED,
  })
  rerecordPolicy: ExamRetakePolicy;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => ExamSection, (section) => section.rule, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sectionId' })
  section: ExamSection;
}
