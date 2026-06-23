import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
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
  PurchaseHistoryCategory,
  PurchaseHistorySortBy,
  StoreBillingModel,
  StoreMarketingBadge,
  StoreOrderStatus,
  StorePackageStatus,
  StorePackageType,
  StorePaymentProvider,
  StorePublicPackageSortBy,
  StoreSortOrder,
  StreakProtectionMode,
} from '../types/package-store.type';
import { CommerceCurrency } from 'src/module-2/course-commerce/types/course-commerce.type';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateStorePackageDto {
  @IsEnum(StorePackageType)
  packageType: StorePackageType;

  @Transform(trim)
  @IsString()
  @MaxLength(180)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @Transform(trim)
  @IsString()
  @Matches(/^\d{1,8}(?:\.\d{1,2})?$/)
  priceEur: string;

  @IsOptional()
  @IsEnum(StoreBillingModel)
  billingModel?: StoreBillingModel;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  voiceMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  textTokens?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  freezeCount?: number;

  @IsOptional()
  @IsEnum(StreakProtectionMode)
  streakProtectionMode?: StreakProtectionMode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  protectionDurationDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cvCreditCount?: number;

  @IsOptional()
  @IsEnum(StoreMarketingBadge)
  marketingBadge?: StoreMarketingBadge;

  @IsOptional()
  @IsBoolean()
  couponsEnabled?: boolean;

  @IsOptional()
  @Transform(upper)
  @IsString()
  @MaxLength(80)
  couponCode?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  googlePlayProductId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  stripePriceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateStorePackageDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^\d{1,8}(?:\.\d{1,2})?$/)
  priceEur?: string;

  @IsOptional()
  @IsEnum(StoreBillingModel)
  billingModel?: StoreBillingModel;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  voiceMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  textTokens?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  freezeCount?: number;

  @IsOptional()
  @IsEnum(StreakProtectionMode)
  streakProtectionMode?: StreakProtectionMode | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  protectionDurationDays?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cvCreditCount?: number;

  @IsOptional()
  @IsEnum(StoreMarketingBadge)
  marketingBadge?: StoreMarketingBadge;

  @IsOptional()
  @IsBoolean()
  couponsEnabled?: boolean;

  @IsOptional()
  @Transform(upper)
  @IsString()
  @MaxLength(80)
  couponCode?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  googlePlayProductId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  stripePriceId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class StorePackageQueryDto {
  @IsOptional()
  @IsEnum(StorePackageType)
  packageType?: StorePackageType;

  @IsOptional()
  @IsEnum(StorePackageStatus)
  status?: StorePackageStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(180)
  search?: string;

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

export class ReorderStorePackageItemDto {
  @IsUUID()
  packageId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder: number;
}

export class ReorderStorePackagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({
    each: true,
  })
  @Type(() => ReorderStorePackageItemDto)
  items: ReorderStorePackageItemDto[];
}

export class UpdateCvEconomyConfigDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  freeCreditsPerSignup: number;

  @IsBoolean()
  allowEditingWithoutCredit: boolean;
}

export class AdminStoreOrderQueryDto {
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
  @IsEnum(StorePackageType)
  packageType?: StorePackageType;

  @IsOptional()
  @IsEnum(StoreOrderStatus)
  status?: StoreOrderStatus;

  @IsOptional()
  @IsEnum(StorePaymentProvider)
  paymentProvider?: StorePaymentProvider;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsIn(['createdAt', 'totalAmountEur', 'orderNumber'])
  sortBy?: 'createdAt' | 'totalAmountEur' | 'orderNumber';

  @IsOptional()
  @IsEnum(StoreSortOrder)
  sortOrder?: StoreSortOrder;
}

export class RefundStoreOrderDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PublicStorePackageQueryDto {
  @IsOptional()
  @IsEnum(StorePackageType)
  packageType?: StorePackageType;

  @IsOptional()
  @IsEnum(StoreBillingModel)
  billingModel?: StoreBillingModel;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(180)
  search?: string;

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
  @IsEnum(StorePublicPackageSortBy)
  sortBy?: StorePublicPackageSortBy;

  @IsOptional()
  @IsEnum(StoreSortOrder)
  sortOrder?: StoreSortOrder;
}

export class StorePackageQuoteQueryDto {
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

export class CreateStoreOrderDto {
  @IsUUID()
  packageId: string;

  @IsOptional()
  @Transform(upper)
  @IsEnum(CommerceCurrency)
  currency?: CommerceCurrency;

  @IsEnum(StorePaymentProvider)
  paymentProvider: StorePaymentProvider;

  @IsUUID()
  idempotencyKey: string;

  @IsOptional()
  @Transform(upper)
  @IsString()
  @MaxLength(80)
  couponCode?: string;
}

export class ConfirmStoreGooglePlayDemoDto {
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  productId: string;

  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  purchaseToken: string;
}

export class ConfirmStoreStripeDemoDto {
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  paymentIntentId: string;

  @IsIn(['succeeded', 'failed'])
  demoResult: 'succeeded' | 'failed';
}

export class StoreOrderHistoryQueryDto {
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
  @IsEnum(PurchaseHistoryCategory)
  category?: PurchaseHistoryCategory;

  @IsOptional()
  @IsEnum(StoreOrderStatus)
  status?: StoreOrderStatus;

  @IsOptional()
  @IsEnum(StorePaymentProvider)
  paymentProvider?: StorePaymentProvider;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(180)
  search?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(PurchaseHistorySortBy)
  sortBy?: PurchaseHistorySortBy;

  @IsOptional()
  @IsEnum(StoreSortOrder)
  sortOrder?: StoreSortOrder;
}
