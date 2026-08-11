import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type {
  ResumeRendererConfig,
  ResumeTemplateFieldSchema,
} from '../types/template-schema.types';

export enum ResumeTemplateVersionStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Entity('resume_studio_template_versions')
@Index(['templateId', 'versionNumber'], { unique: true })
@Index(['templateId', 'status'])
export class ResumeTemplateVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  templateId: string;

  @Column({ type: 'integer' })
  versionNumber: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: ResumeTemplateVersionStatus.DRAFT,
  })
  status: ResumeTemplateVersionStatus;

  @Column({ type: 'text' })
  html: string;

  @Column({ type: 'text' })
  css: string;

  @Column({ type: 'jsonb' })
  fieldSchema: ResumeTemplateFieldSchema;

  @Column({ type: 'jsonb' })
  rendererConfig: ResumeRendererConfig;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  checksum: string;

  @Column({ type: 'uuid', nullable: true })
  createdByAdminId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
