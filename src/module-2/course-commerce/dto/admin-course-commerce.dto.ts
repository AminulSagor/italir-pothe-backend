import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  CommerceSortOrder,
  CourseEnrollmentStatus,
  CoursePaymentProvider,
  CourseProviderProductType,
} from '../types/course-commerce.type';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const productIdPattern = /^[A-Za-z0-9._-]+$/;

export class CreateCourseProviderProductDto {
  @IsEnum(CoursePaymentProvider)
  provider: CoursePaymentProvider;

  @Transform(trim)
  @IsString()
  @MaxLength(255)
  @Matches(productIdPattern, {
    message:
      'productId may contain only letters, numbers, dots, underscores and hyphens.',
  })
  productId: string;

  @IsOptional()
  @IsEnum(CourseProviderProductType)
  productType?: CourseProviderProductType;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  basePlanId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  offerId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCourseProviderProductDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  @Matches(productIdPattern, {
    message:
      'productId may contain only letters, numbers, dots, underscores and hyphens.',
  })
  productId?: string;

  @IsOptional()
  @IsEnum(CourseProviderProductType)
  productType?: CourseProviderProductType;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  basePlanId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  offerId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

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
  @Transform(trim)
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

export class RefundCourseOrderDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}
