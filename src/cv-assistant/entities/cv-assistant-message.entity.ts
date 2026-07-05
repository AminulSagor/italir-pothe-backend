import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { CvAssistantMessageRole } from '../enums/cv-assistant.enum';
import { CvAssistantSession } from './cv-assistant-session.entity';

@Entity('cv_assistant_messages')
@Index(['sessionId', 'createdAt'])
export class CvAssistantMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => CvAssistantSession, (session) => session.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session: CvAssistantSession;

  @Column({ type: 'varchar', length: 30 })
  role: CvAssistantMessageRole;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  questionKey: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
