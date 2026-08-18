import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  AdminExternalPaymentMethod,
  ADMIN_EXTERNAL_PAYMENT_PROVIDER,
  CommerceCurrency,
  CommerceSortOrder,
  CourseEnrollmentStatus,
  CoursePaymentProvider,
  CourseProviderProductType,
} from '../types/course-commerce.type';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const productIdPattern = /^[A-Za-z0-9._-]+$/;
const moneyPattern = /^\d{1,12}(?:\.\d{1,2})?$/;

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
  @IsIn([
    CoursePaymentProvider.GOOGLE_PLAY,
    CoursePaymentProvider.APP_STORE,
    ADMIN_EXTERNAL_PAYMENT_PROVIDER,
  ])
  paymentProvider?: string;

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

export class GrantExternalCourseAccessDto {
  @IsUUID('4')
  userId: string;

  @Transform(trim)
  @IsString()
  @Matches(moneyPattern, {
    message: 'paymentAmount must be a positive amount with up to 2 decimals.',
  })
  paymentAmount: string;

  @IsEnum(CommerceCurrency)
  paymentCurrency: CommerceCurrency;

  @Transform(trim)
  @IsString()
  @Matches(moneyPattern, {
    message: 'amountEur must be a positive amount with up to 2 decimals.',
  })
  amountEur: string;

  @IsEnum(AdminExternalPaymentMethod)
  paymentMethod: AdminExternalPaymentMethod;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  externalReference: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RevokeExternalCourseAccessDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
