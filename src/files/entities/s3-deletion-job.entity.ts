import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum S3DeletionOperation {
  OBJECT = 'object',
  PREFIX = 'prefix',
  MULTIPART = 'multipart',
}

@Entity('s3_deletion_jobs')
@Index(['nextAttemptAt', 'lockedAt'])
export class S3DeletionJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  batchId: string;

  @Column({ type: 'varchar', length: 20 })
  operation: S3DeletionOperation;

  @Column({ type: 'varchar', length: 700 })
  storageKey: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  uploadId: string | null;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  nextAttemptAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lockedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
