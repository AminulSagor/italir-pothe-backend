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

import { CommerceCurrency } from 'src/module-2/course-commerce/types/course-commerce.type';
import {
  PurchaseHistoryCategory,
  PurchaseHistorySortBy,
  StoreBillingModel,
  StoreMarketingBadge,
  StoreOrderStatus,
  StorePackageStatus,
  StorePackageType,
  StorePaymentProvider,
  StoreProviderProductType,
  StorePublicPackageSortBy,
  StoreSortOrder,
  StreakProtectionMode,
} from '../types/package-store.type';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

const productIdPattern = /^[A-Za-z0-9._-]+$/;

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

  /**
   * Internal reference price only. Google Play / App Store return the
   * customer-facing localized price to the mobile application.
   */
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
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateStoreProviderProductDto {
  @IsEnum(StorePaymentProvider)
  provider: StorePaymentProvider;

  @Transform(trim)
  @IsString()
  @MaxLength(255)
  @Matches(productIdPattern, {
    message:
      'productId may contain only letters, numbers, dots, underscores and hyphens.',
  })
  productId: string;

  @IsEnum(StoreProviderProductType)
  productType: StoreProviderProductType;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  basePlanId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  offerId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStoreProviderProductDto {
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
  @IsEnum(StoreProviderProductType)
  productType?: StoreProviderProductType;

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

export class StoreProviderQueryDto {
  @IsEnum(StorePaymentProvider)
  provider: StorePaymentProvider;
}

export class StorePackageQueryDto {
  @IsOptional()
  @IsEnum(StorePackageType)
  packageType?: StorePackageType;

  @IsOptional()
  @IsEnum(StorePackageStatus)
  status?: StorePackageStatus;

  @IsOptional()
  @IsEnum(StorePaymentProvider)
  provider?: StorePaymentProvider;

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
  @IsEnum(StorePaymentProvider)
  provider: StorePaymentProvider;

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
  @IsEnum(StorePaymentProvider)
  provider: StorePaymentProvider;

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

  @IsEnum(StorePaymentProvider)
  paymentProvider: StorePaymentProvider;

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

  @IsOptional()
  @Transform(upper)
  @IsString()
  @MaxLength(80)
  couponCode?: string;
}

export class VerifyStoreGooglePlayPurchaseDto {
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

export class VerifyStoreAppStorePurchaseDto {
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
