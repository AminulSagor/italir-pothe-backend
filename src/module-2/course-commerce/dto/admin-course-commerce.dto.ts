import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  CommerceSortOrder,
  CourseEnrollmentStatus,
  CoursePaymentProvider,
} from '../types/course-commerce.type';

export class AdminEnrollmentQueryDto {
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

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(180)
  search?: string;

  @IsOptional()
  @IsEnum(CourseEnrollmentStatus)
  status?: CourseEnrollmentStatus;

  @IsOptional()
  @IsEnum(CoursePaymentProvider)
  paymentProvider?: CoursePaymentProvider;

  @IsOptional()
  @IsIn(['enrolledAt', 'amountPaid'])
  sortBy?: 'enrolledAt' | 'amountPaid';

  @IsOptional()
  @IsEnum(CommerceSortOrder)
  sortOrder?: CommerceSortOrder;
}
