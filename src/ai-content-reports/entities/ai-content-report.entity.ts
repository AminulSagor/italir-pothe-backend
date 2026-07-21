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

import { File } from 'src/files/entities/file.entity';
import { User } from 'src/users/entities/user.entity';

export enum AiContentReportFeatureType {
  WRITING = 'writing',
  TALKING = 'talking',
  CV_BUILDER = 'cv_builder',
}

export enum AiContentReportIssue {
  OFFENSIVE_OR_HATEFUL = 'offensive_or_hateful',
  SEXUAL_OR_INAPPROPRIATE = 'sexual_or_inappropriate',
  DANGEROUS_OR_HARMFUL = 'dangerous_or_harmful',
  HARASSMENT = 'harassment',
  FALSE_OR_MISLEADING = 'false_or_misleading',
  PRIVACY_CONCERN = 'privacy_concern',
  OTHER = 'other',
}

export enum AiContentReportStatus {
  PENDING = 'pending',
  REVIEWED = 'reviewed',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

@Entity('ai_content_reports')
@Index('IDX_ai_content_reports_status_created_at', ['status', 'createdAt'])
@Index('IDX_ai_content_reports_feature_created_at', [
  'featureType',
  'createdAt',
])
@Index(
  'UQ_ai_content_reports_reporter_client_report_id',
  ['reporterId', 'clientReportId'],
  {
    unique: true,
    where: '"clientReportId" IS NOT NULL',
  },
)
export class AiContentReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'reporterId' })
  reporter: User | null;

  @Column({ type: 'uuid' })
  reporterId: string;

  @Column({ type: 'varchar', length: 30 })
  featureType: AiContentReportFeatureType;

  @Column({ type: 'varchar', length: 60 })
  issue: AiContentReportIssue;

  @Column({ type: 'text', nullable: true })
  details: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  sourceReference: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  messageReference: string | null;

  @Column({ type: 'text', nullable: true })
  aiContentText: string | null;

  @ManyToOne(() => File, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'aiContentFileId' })
  aiContentFile: File | null;

  @Column({ type: 'uuid', nullable: true })
  aiContentFileId: string | null;

  @Column({ type: 'text', nullable: true })
  aiContentUrl: string | null;

  @ManyToOne(() => File, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'screenshotFileId' })
  screenshotFile: File | null;

  @Column({ type: 'uuid', nullable: true })
  screenshotFileId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  clientReportId: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: AiContentReportStatus.PENDING,
  })
  status: AiContentReportStatus;

  @Column({ type: 'text', nullable: true })
  adminNote: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedByAdminId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
