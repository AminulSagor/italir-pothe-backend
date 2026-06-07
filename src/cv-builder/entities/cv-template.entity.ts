import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CvTemplateStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum CvTemplateStyleType {
  ATS = 'ats',
  MODERN_COLUMN = 'modern_column',
  CLASSIC = 'classic',
  CREATIVE = 'creative',
}

export enum CvTemplatePageSize {
  A4 = 'a4',
  LETTER = 'letter',
}

@Entity('cv_templates')
export class CvTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Index()
  @Column({ type: 'varchar', length: 40, default: CvTemplateStyleType.ATS })
  styleType: CvTemplateStyleType;

  @Column({ type: 'varchar', length: 20, default: CvTemplatePageSize.A4 })
  pageSize: CvTemplatePageSize;

  @Column({ type: 'varchar', length: 80, default: 'Inter' })
  fontFamily: string;

  @Column({ type: 'varchar', length: 20, default: '#006B3F' })
  primaryColor: string;

  @Column({ type: 'varchar', length: 20, default: '#E6F6F0' })
  accentColor: string;

  @Column({ type: 'boolean', default: false })
  isPremium: boolean;

  @Index()
  @Column({ type: 'varchar', length: 30, default: CvTemplateStatus.DRAFT })
  status: CvTemplateStatus;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  previewImageUrl: string | null;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  schema: Record<string, unknown>;

  @Index()
  @Column({ type: 'uuid' })
  createdByAdminId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
