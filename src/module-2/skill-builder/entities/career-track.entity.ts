import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CareerTrackStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Entity('skill_builder_career_tracks')
export class CareerTrack {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  subtitleBn: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 80 })
  iconKey: string;

  @Column({ type: 'varchar', length: 30 })
  cardColor: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  introVideoFileId: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  theoryResourceFileId: string | null;

  @Column({
    type: 'enum',
    enum: CareerTrackStatus,
    default: CareerTrackStatus.DRAFT,
  })
  status: CareerTrackStatus;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @Column({ type: 'uuid', nullable: true })
  createdByAdminId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
