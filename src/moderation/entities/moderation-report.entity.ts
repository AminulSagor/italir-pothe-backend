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
@Index('UQ_moderation_reports_case_number', ['caseNumber'], {
  unique: true,
})
@Index('UQ_moderation_reports_source_user_report_id', ['sourceUserReportId'], {
  unique: true,
  where: '"sourceUserReportId" IS NOT NULL',
})
export class ModerationReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /*
   * Connects this admin moderation case to the
   * original report submitted from the mobile app.
   *
   * It remains nullable for older moderation rows.
   */
  @Column({
    type: 'uuid',
    nullable: true,
  })
  sourceUserReportId: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    unique: true,
  })
  caseNumber: string;

  @ManyToOne(() => User, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({
    name: 'reporterId',
  })
  reporter: User | null;

  @Column({
    type: 'uuid',
  })
  reporterId: string;

  @ManyToOne(() => User, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({
    name: 'subjectId',
  })
  subject: User | null;

  @Column({
    type: 'uuid',
  })
  subjectId: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  contentType: string;

  @Column({
    type: 'varchar',
    length: 100,
  })
  contentEntityId: string;

  @Column({
    type: 'varchar',
    length: 100,
  })
  reportReason: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  reporterNote: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'pending',
  })
  status: string;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  submittedAt: Date;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  assignedModeratorId: string | null;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
