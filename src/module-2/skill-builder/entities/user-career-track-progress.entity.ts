import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_career_track_progress')
@Index(['userId', 'careerTrackId'], { unique: true })
export class UserCareerTrackProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid' })
  careerTrackId: string;

  @Column({ type: 'integer', default: 0 })
  videoWatchPercent: number;

  @Column({ type: 'boolean', default: false })
  isTheoryOpened: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  theoryOpenedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastActivityAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
