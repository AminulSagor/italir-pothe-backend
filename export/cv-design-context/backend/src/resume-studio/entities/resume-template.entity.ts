import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ResumeTemplateStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Entity('resume_studio_templates')
@Index(['category', 'status', 'sortOrder'])
export class ResumeTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 140 })
  slug: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 600, nullable: true })
  description: string | null;

  @Index()
  @Column({ type: 'varchar', length: 80 })
  category: string;

  @Column({ type: 'boolean', default: false })
  isPremium: boolean;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: ResumeTemplateStatus.DRAFT,
  })
  status: ResumeTemplateStatus;

  @Column({ type: 'uuid', nullable: true })
  publishedVersionId: string | null;

  @Column({ type: 'integer', nullable: true })
  publishedVersionNumber: number | null;

  @Column({ type: 'varchar', length: 700, nullable: true })
  previewPdfStorageKey: string | null;

  @Column({ type: 'varchar', length: 700, nullable: true })
  previewImageStorageKey: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdByAdminId: string | null;

  @Column({ type: 'uuid', nullable: true })
  updatedByAdminId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
