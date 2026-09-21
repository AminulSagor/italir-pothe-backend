import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum ResumeGenerationStatus {
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('resume_studio_generations')
@Index(['userId', 'documentId', 'createdAt'])
@Index(['userId', 'contentHash'], { unique: true })
export class ResumeGeneration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  documentId: string;

  @Column({ type: 'uuid' })
  templateId: string;

  @Column({ type: 'uuid' })
  templateVersionId: string;

  @Column({ type: 'integer' })
  templateVersionNumber: number;

  /**
   * Revision of the editable draft used to create this PDF. Null is reserved
   * for legacy generations created before revision tracking was introduced.
   */
  @Column({ type: 'integer', nullable: true })
  documentRevision: number | null;

  @Column({ type: 'varchar', length: 64 })
  contentHash: string;

  @Column({ type: 'varchar', length: 700 })
  pdfStorageKey: string;

  @Column({ type: 'integer' })
  pageCount: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  warnings: string[];

  @Column({
    type: 'varchar',
    length: 30,
    default: ResumeGenerationStatus.COMPLETED,
  })
  status: ResumeGenerationStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
