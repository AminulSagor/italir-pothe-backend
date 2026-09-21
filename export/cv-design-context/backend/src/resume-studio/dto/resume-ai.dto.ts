import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const RESUME_AI_ASSIST_TYPES = [
  'summary-suggestions',
  'description-suggestions',
  'highlight-suggestions',
  'technical-skill-suggestions',
] as const;

export type ResumeAiAssistType = (typeof RESUME_AI_ASSIST_TYPES)[number];

export class ResumeSummarySuggestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  currentSummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  targetRole?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  experienceHighlights?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsIn(['professional', 'concise', 'impactful'])
  tone?: 'professional' | 'concise' | 'impactful';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

export class ResumeFieldSuggestionDto {
  @IsIn(RESUME_AI_ASSIST_TYPES)
  assistType!: ResumeAiAssistType;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  currentText?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  existingItems?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  targetRole?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  itemTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  organization?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  experienceHighlights?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}
