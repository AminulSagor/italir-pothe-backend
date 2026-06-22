import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import {
  CvTemplatePageSize,
  CvTemplateStyleType,
} from './cv-template.entity';

@Entity('cv_template_default_layouts')
@Unique(['styleType'])
export class CvTemplateDefaultLayout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 40 })
  styleType: CvTemplateStyleType;

  @Column({ type: 'varchar', length: 20, default: CvTemplatePageSize.A4 })
  pageSize: CvTemplatePageSize;

  @Column({ type: 'varchar', length: 80, default: 'Inter' })
  fontFamily: string;

  @Column({ type: 'varchar', length: 20, default: '#183847' })
  primaryColor: string;

  @Column({ type: 'varchar', length: 20, default: '#F3F4F6' })
  accentColor: string;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  schema: Record<string, unknown>;

  @Index()
  @Column({ type: 'uuid' })
  updatedByAdminId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
