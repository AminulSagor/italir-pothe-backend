import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from 'src/users/entities/user.entity';
import { CvTemplate } from './cv-template.entity';

export enum CvDocumentStatus {
  DRAFT = 'draft',
  READY = 'ready',
}

@Entity('cv_documents')
export class CvDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid' })
  templateId: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'varchar', length: 20, default: '#006B3F' })
  themeColor: string;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  formData: Record<string, unknown>;

  @Index()
  @Column({ type: 'varchar', length: 30, default: CvDocumentStatus.DRAFT })
  status: CvDocumentStatus;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => CvTemplate, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'templateId' })
  template: CvTemplate;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
