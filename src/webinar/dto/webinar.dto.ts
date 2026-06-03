import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { WebinarStatus } from '../entities/webinar.entity';

const createStatuses = [WebinarStatus.DRAFT, WebinarStatus.SCHEDULED];

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const transformBoolean = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue === 'true') {
      return true;
    }

    if (normalizedValue === 'false') {
      return false;
    }
  }

  return value;
};

const transformNumber = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  return Number(value);
};

const transformCourseIds = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item) => (typeof item === 'string' ? item.trim() : item));
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

export class CreateWebinarDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(180)
  @Transform(trimString)
  title: string;

  @IsNotEmpty()
  @IsDateString()
  @Transform(trimString)
  dateTime: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  @Transform(trimString)
  hostTeacherName: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  @Transform(trimString)
  thumbnailImageUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  @Transform(transformBoolean)
  sendNotification?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @Transform(transformCourseIds)
  courseIds?: string[] | null;

  @IsOptional()
  @IsIn(createStatuses)
  status?: WebinarStatus.DRAFT | WebinarStatus.SCHEDULED;
}

export class UpdateWebinarDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  @Transform(trimString)
  title?: string;

  @IsOptional()
  @IsDateString()
  @Transform(trimString)
  dateTime?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Transform(trimString)
  hostTeacherName?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  @Transform(trimString)
  thumbnailImageUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  @Transform(transformBoolean)
  sendNotification?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @Transform(transformCourseIds)
  courseIds?: string[] | null;

  @IsOptional()
  @IsIn(Object.values(WebinarStatus))
  status?: WebinarStatus;
}
