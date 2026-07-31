import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum MediaType {
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  PDF = 'pdf',
}

export enum MediaAssetStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum VideoTranscodeStatus {
  NOT_REQUIRED = 'not_required',
  PENDING = 'pending',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

@Entity('media_assets')
export class MediaAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  fileId: string;

  @Column({
    type: 'varchar',
    length: 180,
    nullable: true,
  })
  title: string | null;

  @Column({
    type: 'varchar',
    length: 30,
  })
  mediaType: MediaType;

  @Column({
    type: 'integer',
    nullable: true,
  })
  durationSeconds: number | null;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  thumbnailFileId: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: VideoTranscodeStatus.NOT_REQUIRED,
  })
  transcodeStatus: VideoTranscodeStatus;

  @Column({
    type: 'varchar',
    length: 700,
    nullable: true,
  })
  hlsMasterKey: string | null;

  @Column({
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  hlsGenerationId: string | null;

  @Column({
    type: 'integer',
    nullable: true,
  })
  sourceWidth: number | null;

  @Column({
    type: 'integer',
    nullable: true,
  })
  sourceHeight: number | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  transcodeError: string | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  transcodedAt: Date | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: MediaAssetStatus.ACTIVE,
  })
  status: MediaAssetStatus;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
