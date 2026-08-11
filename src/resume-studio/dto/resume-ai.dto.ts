import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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
