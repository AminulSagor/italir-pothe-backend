import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ModerationReport } from './moderation-report.entity';

@Entity('report_visual_evidence')
export class ReportVisualEvidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ModerationReport, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reportId' })
  report: ModerationReport;

  @Column({ type: 'uuid' })
  reportId: string;

  @Column({ type: 'text' })
  mediaUrl: string;

  @Column({ type: 'text', nullable: true })
  descriptionText: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  uploadedAt: Date;
}
