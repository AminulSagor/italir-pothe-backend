import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SkillBuilderSentenceStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

@Entity('skill_builder_sentences')
export class SkillBuilderSentence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  moduleId: string;

  @Column({ type: 'varchar', length: 300 })
  italianSentence: string;

  @Column({ type: 'varchar', length: 300 })
  bengaliTranslation: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  aiVoiceFileId: string | null;

  @Column({ type: 'integer', nullable: true })
  voiceDurationSeconds: number | null;

  @Column({
    type: 'enum',
    enum: SkillBuilderSentenceStatus,
    default: SkillBuilderSentenceStatus.ACTIVE,
  })
  status: SkillBuilderSentenceStatus;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @Column({ type: 'uuid', nullable: true })
  createdByAdminId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
