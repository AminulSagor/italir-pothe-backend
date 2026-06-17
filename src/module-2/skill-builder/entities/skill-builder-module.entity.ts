import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SkillBuilderModuleStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

@Entity('skill_builder_modules')
@Index(['careerTrackId', 'name'], { unique: true })
export class SkillBuilderModuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  careerTrackId: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  subtitleBn: string | null;

  @Column({
    type: 'enum',
    enum: SkillBuilderModuleStatus,
    default: SkillBuilderModuleStatus.ACTIVE,
  })
  status: SkillBuilderModuleStatus;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
