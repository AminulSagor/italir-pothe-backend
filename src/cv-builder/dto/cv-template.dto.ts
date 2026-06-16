import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsHexColor,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  CvTemplatePageSize,
  CvTemplateStatus,
  CvTemplateStyleType,
} from '../entities/cv-template.entity';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const transformBoolean = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === 'true') return true;
    if (normalizedValue === 'false') return false;
  }

  return value;
};

const transformNumber = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined || value === '') return undefined;
  return Number(value);
};

export class PaginationQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(transformNumber)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(transformNumber)
  limit?: number;
}

export class CvTemplateListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['all', ...Object.values(CvTemplateStyleType)])
  styleType?: 'all' | CvTemplateStyleType;
}

export class CreateCvTemplateDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(160)
  @Transform(trimString)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimString)
  description?: string | null;

  @IsOptional()
  @IsIn(Object.values(CvTemplateStyleType))
  styleType?: CvTemplateStyleType;

  @IsOptional()
  @IsIn(Object.values(CvTemplatePageSize))
  pageSize?: CvTemplatePageSize;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trimString)
  fontFamily?: string;

  @IsOptional()
  @IsHexColor()
  @Transform(trimString)
  primaryColor?: string;

  @IsOptional()
  @IsHexColor()
  @Transform(trimString)
  accentColor?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(transformBoolean)
  isPremium?: boolean;

  @IsOptional()
  @IsIn(Object.values(CvTemplateStatus))
  status?: CvTemplateStatus;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  @Transform(trimString)
  previewImageUrl?: string | null;

  @IsOptional()
  @IsObject()
  schema?: Record<string, unknown>;
}

export class UpdateCvTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  @Transform(trimString)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimString)
  description?: string | null;

  @IsOptional()
  @IsIn(Object.values(CvTemplateStyleType))
  styleType?: CvTemplateStyleType;

  @IsOptional()
  @IsIn(Object.values(CvTemplatePageSize))
  pageSize?: CvTemplatePageSize;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trimString)
  fontFamily?: string;

  @IsOptional()
  @IsHexColor()
  @Transform(trimString)
  primaryColor?: string;

  @IsOptional()
  @IsHexColor()
  @Transform(trimString)
  accentColor?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(transformBoolean)
  isPremium?: boolean;

  @IsOptional()
  @IsIn(Object.values(CvTemplateStatus))
  status?: CvTemplateStatus;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  @Transform(trimString)
  previewImageUrl?: string | null;

  @IsOptional()
  @IsObject()
  schema?: Record<string, unknown>;
}

export class SaveCvDefaultLayoutDto {
  @IsOptional()
  @IsIn(Object.values(CvTemplatePageSize))
  pageSize?: CvTemplatePageSize;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trimString)
  fontFamily?: string;

  @IsOptional()
  @IsHexColor()
  @Transform(trimString)
  primaryColor?: string;

  @IsOptional()
  @IsHexColor()
  @Transform(trimString)
  accentColor?: string;

  @IsNotEmpty()
  @IsObject()
  schema: Record<string, unknown>;
}
