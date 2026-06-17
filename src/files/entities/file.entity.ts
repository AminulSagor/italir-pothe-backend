import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum FilePurpose {
  COURSE_COVER = 'course_cover',
  LESSON_VIDEO = 'lesson_video',
  LESSON_AUDIO = 'lesson_audio',
  LESSON_IMAGE = 'lesson_image',
  LESSON_PDF = 'lesson_pdf',
  QUIZ_AUDIO = 'quiz_audio',
  QUIZ_IMAGE = 'quiz_image',
  EXAM_SPEAKING_AUDIO = 'exam_speaking_audio',
  CERTIFICATE_PDF = 'certificate_pdf',
  SURVIVAL_AUDIO = 'survival_audio',
  SURVIVAL_IMAGE = 'survival_image',
  SURVIVAL_PDF = 'survival_pdf',
  SKILL_BUILDER_VIDEO = 'skill_builder_video',
  SKILL_BUILDER_AUDIO = 'skill_builder_audio',
  SKILL_BUILDER_PDF = 'skill_builder_pdf',
  CAF_HERO_VIDEO = 'caf_hero_video',
  CAF_CHECKLIST_PDF = 'caf_checklist_pdf',
  PROFILE_AVATAR = 'profile_avatar',
  REPORT_EVIDENCE = 'report_evidence',
  WEBINAR_THUMBNAIL = 'webinar_thumbnail',
}

export enum FileVisibility {
  PRIVATE = 'private',
  PUBLIC = 'public',
}

export enum FileUploadStatus {
  PENDING = 'pending',
  UPLOADED = 'uploaded',
  FAILED = 'failed',
  ARCHIVED = 'archived',
}

@Entity('files')
export class File {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 80, nullable: true })
  ownerUserId: string | null;

  @Index()
  @Column({ type: 'varchar', length: 80, nullable: true })
  createdByAdminId: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 700 })
  storageKey: string;

  @Column({ type: 'varchar', length: 255 })
  originalName: string;

  @Column({ type: 'varchar', length: 120 })
  mimeType: string;

  @Column({ type: 'integer' })
  sizeBytes: number;

  @Column({ type: 'varchar', length: 80 })
  filePurpose: FilePurpose;

  @Column({
    type: 'varchar',
    length: 30,
    default: FileVisibility.PRIVATE,
  })
  visibility: FileVisibility;

  @Column({
    type: 'varchar',
    length: 30,
    default: FileUploadStatus.UPLOADED,
  })
  uploadStatus: FileUploadStatus;

  @Column({ type: 'timestamptz', nullable: true })
  uploadedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
