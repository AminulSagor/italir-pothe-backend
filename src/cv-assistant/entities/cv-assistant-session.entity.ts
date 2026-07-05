import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  CvAssistantConversationMode,
  CvAssistantEditMode,
  CvAssistantPhotoDecision,
  CvAssistantSessionStatus,
} from '../enums/cv-assistant.enum';
import { CvAssistantMessage } from './cv-assistant-message.entity';

export interface CvAssistantPendingSuggestion {
  key: string;
  targetField: string | null;
  text: string;
}

export interface CvAssistantCompletenessState {
  missingRequiredFields: string[];
  missingTemplateSections: string[];
  unresolvedOptionalSections: string[];
}

@Entity('cv_assistant_sessions')
@Index(['userId', 'createdAt'])
@Index(['userId', 'status'])
export class CvAssistantSession {
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
  templateId: string | null;

  @Column({
    type: 'varchar',
    length: 40,
    default: CvAssistantSessionStatus.ACTIVE,
  })
  status: CvAssistantSessionStatus;

  @Column({
    type: 'varchar',
    length: 30,
    default: CvAssistantConversationMode.ONE_BY_ONE,
  })
  conversationMode: CvAssistantConversationMode;

  @Column({
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  currentQuestionKey: string | null;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  currentQuestion: Record<string, unknown> | null;

  @Column({
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  collectedCvData: Record<string, unknown>;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  templateAnalysis: Record<string, unknown> | null;

  /*
   * Keep temporarily for compatibility with existing
   * database records. Skip functionality is no longer used.
   */
  @Column({
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  skippedQuestionKeys: string[];

  /*
   * AI suggestions currently awaiting confirmation.
   */
  @Column({
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  pendingSuggestions: CvAssistantPendingSuggestion[];

  /*
   * Suggestion keys accepted by the user.
   * Edited suggestions are also considered confirmed.
   */
  @Column({
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  confirmedSuggestionKeys: string[];

  /*
   * Suggestion keys explicitly rejected by the user.
   */
  @Column({
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  rejectedSuggestionKeys: string[];

  /*
   * Optional sections explicitly declined by the user.
   */
  @Column({
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  declinedOptionalSections: string[];

  /*
   * Stores unresolved required fields, template sections,
   * and optional sections.
   */
  @Column({
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  completenessState: CvAssistantCompletenessState;

  /*
   * uploaded, without_photo, not_applicable, or unresolved.
   */
  @Column({
    type: 'varchar',
    length: 30,
    default: CvAssistantPhotoDecision.UNRESOLVED,
  })
  photoDecision: CvAssistantPhotoDecision;

  /*
   * Final quality-check problems that block generation.
   */
  @Column({
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  qualityIssues: string[];

  @Column({
    type: 'boolean',
    default: false,
  })
  qualityCheckPassed: boolean;

  /*
   * Final backend-controlled generation permission.
   */
  @Column({
    type: 'boolean',
    default: false,
  })
  canGenerate: boolean;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  qualityCheckedAt: Date | null;

  @Column({
    type: 'int',
    default: 0,
  })
  progress: number;

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

  /*
   * Null during normal CV creation.
   * facts_only edits information while preserving design.
   * design_and_facts edits information and then design.
   */
  @Column({
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  editMode: CvAssistantEditMode | null;

  /*
   * The completed generation from which this edit session
   * was created.
   */
  @Column({
    type: 'uuid',
    nullable: true,
  })
  sourceGenerationId: string | null;

  /*
   * Required only for design_and_facts editing.
   */
  @Column({
    type: 'text',
    nullable: true,
  })
  pendingDesignInstruction: string | null;

  /*
   * The new generation created by this assistant session.
   */
  @Column({
    type: 'uuid',
    nullable: true,
  })
  generationId: string | null;

  @OneToMany(() => CvAssistantMessage, (message) => message.session)
  messages: CvAssistantMessage[];

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
