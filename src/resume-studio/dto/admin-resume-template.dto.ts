import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateResumeTemplateDto {
  @IsString()
  @Length(2, 120)
  name: string;

  @IsString()
  @Length(2, 140)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  description?: string;

  @IsString()
  @Length(2, 80)
  category: string;

  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;

  @IsString()
  html: string;

  @IsString()
  css: string;

  @IsObject()
  fieldSchema: Record<string, unknown>;

  @IsObject()
  rendererConfig: Record<string, unknown>;
}

export class UpdateResumeTemplateMetadataDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  category?: string;

  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;
}

export class SaveResumeTemplateDraftDto {
  @IsString()
  html: string;

  @IsString()
  css: string;

  @IsObject()
  fieldSchema: Record<string, unknown>;

  @IsObject()
  rendererConfig: Record<string, unknown>;
}

export class PreviewResumeTemplateDto extends SaveResumeTemplateDraftDto {
  @IsOptional()
  @IsObject()
  sampleData?: Record<string, unknown>;
}


export class InferResumeTemplateFieldSchemaDto {
  @IsString()
  html: string;

  @IsOptional()
  @IsObject()
  currentFieldSchema?: Record<string, unknown>;
}

export class ResumeTemplateAdminQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
