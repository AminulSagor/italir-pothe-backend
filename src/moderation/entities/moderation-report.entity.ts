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
export class ModerationReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 50,
    unique: true,
  })
  caseNumber: string;

  /*
   * The raw reporterId is preserved even when the user account
   * is deleted. In that case, reporter will resolve to null.
   */
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

  /*
   * The raw subjectId is preserved even when the user account
   * is deleted. In that case, subject will resolve to null.
   */
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

  // Supports either integer or UUID entity references.
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
