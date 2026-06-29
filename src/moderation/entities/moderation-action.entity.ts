import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ModerationReport } from './moderation-report.entity';
import { User } from '../../users/entities/user.entity';

@Entity('moderation_actions_log')
export class ModerationAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ModerationReport, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reportId' })
  report: ModerationReport;

  @Column({ type: 'uuid' })
  reportId: string;

  @ManyToOne(() => User, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'moderatorId' })
  moderator: User | null;

  @Column({ type: 'uuid' })
  moderatorId: string;

  @Column({ type: 'varchar', length: 50 })
  actionType: string;

  @Column({ type: 'text' })
  actionReason: string;

  @CreateDateColumn({ type: 'timestamptz' })
  loggedAt: Date;
}
