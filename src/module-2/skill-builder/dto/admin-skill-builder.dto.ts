import { Type } from 'class-transformer';
import {
  IsEnum,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { CareerTrackStatus } from '../entities/career-track.entity';

export enum SkillBuilderSentenceSortBy {
  SORT_ORDER = 'sortOrder',
  ITALIAN_SENTENCE = 'italianSentence',
  BENGALI_TRANSLATION = 'bengaliTranslation',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class CreateCareerTrackDto {
  @IsString()
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  subtitleBn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  iconKey?: string;

  @IsOptional()
  @IsHexColor()
  cardColor?: string;

  @IsUUID()
  introVideoFileId: string;

  @IsUUID()
  theoryResourceFileId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCareerTrackDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  subtitleBn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  iconKey?: string;

  @IsOptional()
  @IsHexColor()
  cardColor?: string;

  @IsOptional()
  @IsUUID()
  introVideoFileId?: string | null;

  @IsOptional()
  @IsUUID()
  theoryResourceFileId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCareerTrackResourcesDto {
  @IsOptional()
  @IsUUID()
  introVideoFileId?: string | null;

  @IsOptional()
  @IsUUID()
  theoryResourceFileId?: string | null;
}

export class AdminCareerTrackQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CareerTrackStatus)
  status?: CareerTrackStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateSkillBuilderModuleDto {
  @IsString()
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  subtitleBn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateSkillBuilderModuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  subtitleBn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class ModuleQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateSkillBuilderSentenceDto {
  @IsString()
  @MaxLength(300)
  italianSentence: string;

  @IsString()
  @MaxLength(300)
  bengaliTranslation: string;

  @IsOptional()
  @IsUUID()
  aiVoiceFileId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  voiceDurationSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateSkillBuilderSentenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  italianSentence?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  bengaliTranslation?: string;

  @IsOptional()
  @IsUUID()
  aiVoiceFileId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  voiceDurationSeconds?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class SentenceQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(SkillBuilderSentenceSortBy)
  sortBy?: SkillBuilderSentenceSortBy;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
