import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  InfluencerBillingProvider,
  InfluencerCouponOwnerType,
  InfluencerCouponProductDomain,
  InfluencerCouponStatus,
  InfluencerLedgerStatus,
  InfluencerLedgerTransactionType,
  InfluencerOrderDomain,
  InfluencerPartnerSortBy,
  InfluencerPartnerStatus,
  InfluencerPaymentMethod,
  InfluencerSocialPlatform,
  InfluencerSortOrder,
} from '../types/influencer-hub.type';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

const nullableTrim = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) {
    return value;
  }

  return typeof value === 'string' ? value.trim() : value;
};

const moneyPattern = /^-?\d{1,8}(?:\.\d{1,2})?$/;
const couponPattern = /^[A-Z0-9_-]{3,80}$/;
const productIdPattern = /^[A-Za-z0-9._-]+$/;

export class InfluencerSocialHandleDto {
  @IsEnum(InfluencerSocialPlatform)
  platform: InfluencerSocialPlatform;

  @Transform(trim)
  @IsString()
  @MaxLength(180)
  handle: string;

  @IsOptional()
  @Transform(nullableTrim)
  @IsString()
  @MaxLength(500)
  url?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class InfluencerProviderMappingDto {
  @IsEnum(InfluencerCouponProductDomain)
  productDomain: InfluencerCouponProductDomain;

  @IsOptional()
  @IsUUID()
  courseId?: string | null;

  @IsOptional()
  @IsUUID()
  storePackageId?: string | null;

  @IsEnum(InfluencerBillingProvider)
  provider: InfluencerBillingProvider;

  @Transform(trim)
  @IsString()
  @MaxLength(255)
  @Matches(productIdPattern)
  regularProviderProductId: string;

  @Transform(trim)
  @IsString()
  @MaxLength(255)
  @Matches(productIdPattern)
  discountedProviderProductId: string;

  @IsOptional()
  @Transform(nullableTrim)
  @IsString()
  @MaxLength(255)
  providerBasePlanId?: string | null;

  @IsOptional()
  @Transform(nullableTrim)
  @IsString()
  @MaxLength(255)
  providerOfferId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class InfluencerDealDto {
  @Transform(upper)
  @IsString()
  @MaxLength(80)
  @Matches(couponPattern)
  couponCode: string;

  @IsOptional()
  @IsEnum(InfluencerCouponOwnerType)
  ownerType?: InfluencerCouponOwnerType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  userDiscountPercentage: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  influencerSharePercentage: number;

  @IsOptional()
  @IsBoolean()
  lifetimeAssociationEnabled?: boolean;

  @IsOptional()
  @IsEnum(InfluencerCouponStatus)
  status?: InfluencerCouponStatus;

  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @Transform(nullableTrim)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InfluencerProviderMappingDto)
  providerMappings?: InfluencerProviderMappingDto[];
}

export class CreateInfluencerPartnerDto {
  @Transform(trim)
  @IsString()
  @MaxLength(180)
  fullName: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @Transform(nullableTrim)
  @IsString()
  @MaxLength(160)
  title?: string | null;

  @IsOptional()
  @Transform(nullableTrim)
  @IsString()
  @MaxLength(1000)
  avatarUrl?: string | null;

  @IsOptional()
  @IsEnum(InfluencerPartnerStatus)
  status?: InfluencerPartnerStatus;

  @IsOptional()
  @IsEnum(InfluencerPaymentMethod)
  paymentMethod?: InfluencerPaymentMethod;

  @IsOptional()
  paymentDetails?: Record<string, unknown> | null;

  @IsOptional()
  @Transform(nullableTrim)
  @IsString()
  @MaxLength(180)
  paymentDisplayLabel?: string | null;

  @IsOptional()
  @Transform(upper)
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @Transform(nullableTrim)
  @IsString()
  @MaxLength(2000)
  administrativeNotes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => InfluencerSocialHandleDto)
  socialHandles?: InfluencerSocialHandleDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => InfluencerDealDto)
  deal?: InfluencerDealDto;
}

export class UpdateInfluencerPartnerDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(180)
  fullName?: string;

  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @Transform(nullableTrim)
  @IsString()
  @MaxLength(160)
  title?: string | null;

  @IsOptional()
  @Transform(nullableTrim)
  @IsString()
  @MaxLength(1000)
  avatarUrl?: string | null;

  @IsOptional()
  @IsEnum(InfluencerPartnerStatus)
  status?: InfluencerPartnerStatus;

  @IsOptional()
  @IsEnum(InfluencerPaymentMethod)
  paymentMethod?: InfluencerPaymentMethod;

  @IsOptional()
  paymentDetails?: Record<string, unknown> | null;

  @IsOptional()
  @Transform(nullableTrim)
  @IsString()
  @MaxLength(180)
  paymentDisplayLabel?: string | null;

  @IsOptional()
  @Transform(upper)
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @Transform(nullableTrim)
  @IsString()
  @MaxLength(2000)
  administrativeNotes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => InfluencerSocialHandleDto)
  socialHandles?: InfluencerSocialHandleDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => InfluencerDealDto)
  deal?: InfluencerDealDto;
}

export class InfluencerPartnerQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(180)
  search?: string;

  @IsOptional()
  @IsEnum(InfluencerPartnerStatus)
  status?: InfluencerPartnerStatus;

  @IsOptional()
  @Transform(upper)
  @IsString()
  @MaxLength(80)
  couponCode?: string;

  @IsOptional()
  @IsEnum(InfluencerCouponProductDomain)
  productDomain?: InfluencerCouponProductDomain;

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
  @IsEnum(InfluencerPartnerSortBy)
  sortBy?: InfluencerPartnerSortBy;

  @IsOptional()
  @IsEnum(InfluencerSortOrder)
  sortOrder?: InfluencerSortOrder;
}

export class ValidateInfluencerCouponDto {
  @Transform(upper)
  @IsString()
  @MaxLength(80)
  @Matches(couponPattern)
  couponCode: string;

  @IsEnum(InfluencerCouponProductDomain)
  productDomain: InfluencerCouponProductDomain;

  @IsUUID()
  productId: string;

  @IsEnum(InfluencerBillingProvider)
  provider: InfluencerBillingProvider;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  @Matches(productIdPattern)
  regularProviderProductId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  @Matches(moneyPattern)
  orderSubtotalEur?: string;
}

export class AddManualLedgerEntryDto {
  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @Transform(trim)
  @IsString()
  @MaxLength(20)
  @Matches(moneyPattern)
  amountEur: string;

  @IsOptional()
  @IsEnum(InfluencerLedgerTransactionType)
  transactionType?: InfluencerLedgerTransactionType;

  @IsOptional()
  @IsEnum(InfluencerLedgerStatus)
  status?: InfluencerLedgerStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  referenceId?: string;

  @IsOptional()
  @Transform(nullableTrim)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class InternalInfluencerPaidOrderDto {
  @IsEnum(InfluencerOrderDomain)
  orderDomain: InfluencerOrderDomain;

  @IsUUID()
  orderId: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}

export class InfluencerReportQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
