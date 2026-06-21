import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
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

export class CourseQuoteQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsEnum(CommerceCurrency)
  currency: CommerceCurrency;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(80)
  couponCode?: string;
}

export class CreateCoursePurchaseOrderDto {
  @IsUUID()
  courseId: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsEnum(CommerceCurrency)
  currency: CommerceCurrency;

  @IsEnum(CoursePaymentProvider)
  paymentProvider: CoursePaymentProvider;

  @IsUUID()
  idempotencyKey: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(80)
  couponCode?: string;
}

export class ConfirmGooglePlayDemoDto {
  @IsString()
  @MaxLength(255)
  productId: string;

  @IsString()
  @MaxLength(1000)
  purchaseToken: string;
}

export class ConfirmStripeDemoDto {
  @IsString()
  @MaxLength(255)
  paymentIntentId: string;

  @IsIn(['succeeded', 'failed'])
  demoResult: 'succeeded' | 'failed';
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
