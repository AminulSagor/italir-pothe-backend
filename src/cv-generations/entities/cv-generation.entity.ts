import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  CvGenerationMode,
  CvGenerationStatus,
} from '../enums/cv-generation.enum';

@Entity('cv_generations')
@Index(['userId', 'createdAt'])
@Index(['userId', 'status'])
@Index(['sourceGenerationId'])
@Index('UQ_cv_generations_active_assistant_session', ['assistantSessionId'], {
  unique: true,

  /*
   * Only one active or completed generation may exist for
   * the same assistant session.
   *
   * Failed generations do not block a safe retry.
   */
  where: `"assistantSessionId" IS NOT NULL AND "status" IN ('${CvGenerationStatus.PROCESSING}', '${CvGenerationStatus.COMPLETED}')`,
})
export class CvGeneration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  userId: string;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  assistantSessionId: string | null;

  /*
   * Previous generation used as the source for
   * regeneration or assistant-based editing.
   */
  @Column({
    type: 'uuid',
    nullable: true,
  })
  sourceGenerationId: string | null;

  @Column({
    type: 'varchar',
    length: 30,
  })
  mode: CvGenerationMode;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  templateId: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: CvGenerationStatus.PROCESSING,
  })
  status: CvGenerationStatus;

  @Column({
    type: 'jsonb',
  })
  cvData: Record<string, unknown>;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  templateAnalysis: Record<string, unknown> | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  style: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  colorTheme: string | null;

  /*
   * Design-only instruction for regeneration.
   * It must never be used to modify cvData.
   */
  @Column({
    type: 'text',
    nullable: true,
  })
  regenerationInstruction: string | null;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  profilePhotoFileId: string | null;

  @Column({
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  referenceImageFileIds: string[];

  @Column({
    type: 'uuid',
    nullable: true,
  })
  generatedImageFileId: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  errorMessage: string | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
