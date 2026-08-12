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

/**
 * Tracks how the first successful Resume Studio PDF for a document was paid.
 * Once a document is charged, every later edit/regeneration of that same
 * document is free.
 */
export enum ResumeCreationChargeSource {
  FREE_ALLOWANCE = 'free_allowance',
  PAID_CREDIT = 'paid_credit',
  LEGACY = 'legacy',
}

@Entity('resume_studio_documents')
@Index(['userId', 'updatedAt'])
@Index(['userId', 'creationChargeSource'])
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

  /**
   * Null means the user has not successfully created a PDF from this draft yet.
   * A credit/free allowance is consumed only on the first successful render.
   */
  @Column({ type: 'timestamptz', nullable: true })
  creationChargedAt: Date | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  creationChargeSource: ResumeCreationChargeSource | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastAutosavedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
