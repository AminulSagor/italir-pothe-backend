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

import {
  SurvivalCardVariant,
  SurvivalSituationStatus,
} from '../entities/survival-situation.entity';

export enum SurvivalSituationSortBy {
  SORT_ORDER = 'sortOrder',
  TITLE = 'title',
  STATUS = 'status',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class CreateSurvivalSituationDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  subtitleBn?: string;

  @IsString()
  iconKey: string;

  @IsHexColor()
  cardColor: string;

  @IsOptional()
  @IsEnum(SurvivalCardVariant)
  cardVariant?: SurvivalCardVariant;

  @IsUUID()
  resourceFileId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateSurvivalSituationDto {
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
  @MaxLength(80)
  iconKey?: string;

  @IsOptional()
  @IsHexColor()
  cardColor?: string;

  @IsOptional()
  @IsEnum(SurvivalCardVariant)
  cardVariant?: SurvivalCardVariant;

  @IsOptional()
  @IsUUID()
  resourceFileId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class AdminSurvivalSituationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(SurvivalSituationStatus)
  status?: SurvivalSituationStatus;

  @IsOptional()
  @IsEnum(SurvivalSituationSortBy)
  sortBy?: SurvivalSituationSortBy;

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
