import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ModerationReport } from './moderation-report.entity';

@Entity('report_visual_evidence')
@Index('IDX_report_visual_evidence_report_id', ['reportId'])
@Index('IDX_report_visual_evidence_file_id', ['evidenceFileId'])
export class ReportVisualEvidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ModerationReport, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'reportId',
  })
  report: ModerationReport;

  @Column({
    type: 'uuid',
  })
  reportId: string;

  /*
   * Store the file ID instead of permanently
   * storing an expiring signed URL.
   */
  @Column({
    type: 'uuid',
    nullable: true,
  })
  evidenceFileId: string | null;

  /*
   * Kept for old evidence records that may
   * already contain a direct URL.
   */
  @Column({
    type: 'text',
    nullable: true,
  })
  mediaUrl: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  descriptionText: string | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  uploadedAt: Date;
}
