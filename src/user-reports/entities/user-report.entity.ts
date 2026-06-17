import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { ReportReason } from './report-reason.entity';
import { File } from 'src/files/entities/file.entity';

export enum UserReportStatus {
  PENDING = 'pending',
  REVIEWED = 'reviewed',
  RESOLVED = 'resolved',
}

@Entity('user_reports')
export class UserReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'reporterId' })
  reporter: User;

  @Column({ type: 'uuid' })
  reporterId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'reportedUserId' })
  reportedUser: User;

  @Column({ type: 'uuid' })
  reportedUserId: string;

  @ManyToOne(() => ReportReason, { nullable: false })
  @JoinColumn({ name: 'reasonId' })
  reason: ReportReason;

  @Column({ type: 'uuid' })
  reasonId: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ManyToOne(() => File, { nullable: true })
  @JoinColumn({ name: 'evidenceFileId' })
  evidenceFile: File | null;

  @Column({ type: 'uuid', nullable: true })
  evidenceFileId: string | null;

  @Column({ type: 'varchar', length: 20, default: UserReportStatus.PENDING })
  status: UserReportStatus;

  @Column({ type: 'varchar', length: 60, nullable: true })
  ticketId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
