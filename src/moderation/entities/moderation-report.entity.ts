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
import { User } from '../../users/entities/user.entity';

@Entity('moderation_reports')
@Index('UQ_moderation_reports_case_number', ['caseNumber'], { unique: true })
export class ModerationReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  caseNumber: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'reporterId' })
  reporter: User;

  @Column({ type: 'uuid' })
  reporterId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'subjectId' })
  subject: User;

  @Column({ type: 'uuid' })
  subjectId: string;

  @Column({ type: 'varchar', length: 50 })
  contentType: string;

  // content_entity_id kept as varchar to support either int or uuid references
  @Column({ type: 'varchar', length: 100 })
  contentEntityId: string;

  @Column({ type: 'varchar', length: 100 })
  reportReason: string;

  @Column({ type: 'text', nullable: true })
  reporterNote: string | null;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: string;

  @CreateDateColumn({ type: 'timestamptz' })
  submittedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  assignedModeratorId: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
