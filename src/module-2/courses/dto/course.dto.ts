import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

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
