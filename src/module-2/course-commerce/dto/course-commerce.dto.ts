import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  CommerceCurrency,
  CourseEnrollmentStatus,
  CoursePaymentProvider,
  CoursePurchaseStatus,
} from '../types/course-commerce.type';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

const productIdPattern = /^[A-Za-z0-9._-]+$/;

export class CourseQuoteQueryDto {
  @IsEnum(CoursePaymentProvider)
  provider: CoursePaymentProvider;

  @IsOptional()
  @Transform(upper)
  @IsEnum(CommerceCurrency)
  currency?: CommerceCurrency;

  @IsOptional()
  @Transform(upper)
  @IsString()
  @MaxLength(80)
  couponCode?: string;
}

export class CreateCoursePurchaseOrderDto {
  @IsUUID()
  courseId: string;

  @IsEnum(CoursePaymentProvider)
  paymentProvider: CoursePaymentProvider;

  @Transform(trim)
  @IsString()
  @MaxLength(255)
  @Matches(productIdPattern, {
    message:
      'productId may contain only letters, numbers, dots, underscores and hyphens.',
  })
  productId: string;

  @IsOptional()
  @Transform(upper)
  @IsEnum(CommerceCurrency)
  currency?: CommerceCurrency;

  @IsUUID()
  idempotencyKey: string;

  /**
   * Internal reference only. Google Play and App Store prices/offers control
   * the actual amount charged by the store.
   */
  @IsOptional()
  @Transform(upper)
  @IsString()
  @MaxLength(80)
  couponCode?: string;
}

export class VerifyCourseGooglePlayPurchaseDto {
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  productId: string;

  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  purchaseToken: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  transactionId?: string;
}

export class VerifyCourseAppStorePurchaseDto {
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  productId: string;

  @Transform(trim)
  @IsString()
  @MaxLength(255)
  transactionId: string;

  @Transform(trim)
  @IsString()
  @MaxLength(50000)
  signedTransactionInfo: string;
}

export class PurchaseHistoryQueryDto {
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
  @IsEnum(CoursePurchaseStatus)
  status?: CoursePurchaseStatus;

  @IsOptional()
  @IsEnum(CoursePaymentProvider)
  paymentProvider?: CoursePaymentProvider;
}

export class MyEnrollmentQueryDto {
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
  @IsEnum(CourseEnrollmentStatus)
  status?: CourseEnrollmentStatus;
}
