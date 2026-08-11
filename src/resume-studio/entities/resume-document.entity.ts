import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ResumeData } from '../types/resume-data.types';

export enum ResumeDocumentStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

@Entity('resume_studio_documents')
@Index(['userId', 'updatedAt'])
export class ResumeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'uuid', nullable: true })
  templateId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  data: ResumeData;

  @Column({ type: 'integer', default: 1 })
  revision: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: ResumeDocumentStatus.DRAFT,
  })
  status: ResumeDocumentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  lastAutosavedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
