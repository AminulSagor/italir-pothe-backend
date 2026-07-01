import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { CoursePaymentProvider } from '../../course-commerce/types/course-commerce.type';
import { CourseStatus } from '../entities/course.entity';

export class CreateCourseDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(180)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  subtitle?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  slug?: string;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  couponCode?: string;

  @IsOptional()
  @IsUUID()
  finalExamTemplateId?: string;

  @IsOptional()
  @IsIn(Object.values(CourseStatus))
  status?: CourseStatus;
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  subtitle?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  slug?: string;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  couponCode?: string;

  @IsOptional()
  @IsUUID()
  finalExamTemplateId?: string;

  @IsOptional()
  @IsIn(Object.values(CourseStatus))
  status?: CourseStatus;
}

export class AdminCourseQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return undefined;
  })
  @IsArray()
  @IsEnum(CourseStatus, { each: true })
  statuses?: CourseStatus[];

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

export class PublicCourseQueryDto {
  @IsOptional()
  @IsEnum(CoursePaymentProvider)
  provider?: CoursePaymentProvider;
}
