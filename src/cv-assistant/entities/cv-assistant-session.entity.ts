import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  CvAssistantConversationMode,
  CvAssistantSessionStatus,
} from '../enums/cv-assistant.enum';
import { CvAssistantMessage } from './cv-assistant-message.entity';

@Entity('cv_assistant_sessions')
@Index(['userId', 'createdAt'])
@Index(['userId', 'status'])
export class CvAssistantSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  templateId: string | null;

  @Column({
    type: 'varchar',
    length: 40,
    default: CvAssistantSessionStatus.ACTIVE,
  })
  status: CvAssistantSessionStatus;

  @Column({
    type: 'varchar',
    length: 30,
    default: CvAssistantConversationMode.ONE_BY_ONE,
  })
  conversationMode: CvAssistantConversationMode;

  @Column({ type: 'varchar', length: 120, nullable: true })
  currentQuestionKey: string | null;

  @Column({ type: 'jsonb', nullable: true })
  currentQuestion: Record<string, unknown> | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  collectedCvData: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  templateAnalysis: Record<string, unknown> | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  skippedQuestionKeys: string[];

  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ type: 'uuid', nullable: true })
  profilePhotoFileId: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  referenceImageFileIds: string[];

  @Column({ type: 'uuid', nullable: true })
  generationId: string | null;

  @OneToMany(() => CvAssistantMessage, (message) => message.session)
  messages: CvAssistantMessage[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
