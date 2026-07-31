import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { bigintNumberTransformer } from './bigint-number.transformer';
import { FilePurpose, FileVisibility } from './file.entity';

export enum MultipartUploadStatus {
  INITIATED = 'initiated',
  COMPLETED = 'completed',
  ABORTED = 'aborted',
  EXPIRED = 'expired',
}

@Entity('multipart_upload_sessions')
@Index(['status', 'expiresAt'])
export class MultipartUploadSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 1024 })
  uploadId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 700 })
  storageKey: string;

  @Column({ type: 'varchar', length: 255 })
  originalName: string;

  @Column({ type: 'varchar', length: 120 })
  mimeType: string;

  @Column({
    type: 'bigint',
    transformer: bigintNumberTransformer,
  })
  sizeBytes: number;

  @Column({ type: 'varchar', length: 80 })
  filePurpose: FilePurpose;

  @Column({
    type: 'varchar',
    length: 30,
    default: FileVisibility.PRIVATE,
  })
  visibility: FileVisibility;

  @Index()
  @Column({ type: 'varchar', length: 80, nullable: true })
  ownerUserId: string | null;

  @Index()
  @Column({ type: 'varchar', length: 80, nullable: true })
  createdByAdminId: string | null;

  @Column({ type: 'integer' })
  partSizeBytes: number;

  @Column({ type: 'integer' })
  totalParts: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: MultipartUploadStatus.INITIATED,
  })
  status: MultipartUploadStatus;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  abortedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
