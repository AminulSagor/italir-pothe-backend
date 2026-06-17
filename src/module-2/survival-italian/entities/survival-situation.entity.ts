import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SurvivalSituationStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum SurvivalCardVariant {
  HERO = 'hero',
  NORMAL = 'normal',
  WIDE = 'wide',
}

@Entity('survival_situations')
export class SurvivalSituation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  subtitleBn: string | null;

  @Column({ type: 'varchar', length: 80 })
  iconKey: string;

  @Column({ type: 'varchar', length: 30 })
  cardColor: string;

  @Column({
    type: 'enum',
    enum: SurvivalCardVariant,
    default: SurvivalCardVariant.NORMAL,
  })
  cardVariant: SurvivalCardVariant;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  resourceFileId: string | null;

  @Column({
    type: 'enum',
    enum: SurvivalSituationStatus,
    default: SurvivalSituationStatus.DRAFT,
  })
  status: SurvivalSituationStatus;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @Column({ type: 'uuid', nullable: true })
  createdByAdminId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
