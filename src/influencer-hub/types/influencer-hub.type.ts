export enum InfluencerPartnerStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

export enum InfluencerSocialPlatform {
  INSTAGRAM = 'instagram',
  TIKTOK = 'tiktok',
  YOUTUBE = 'youtube',
  FACEBOOK = 'facebook',
  LINKEDIN = 'linkedin',
  WEBSITE = 'website',
  OTHER = 'other',
}

export enum InfluencerPaymentMethod {
  BANK_TRANSFER = 'bank_transfer',
  PAYPAL = 'paypal',
  WISE = 'wise',
  MANUAL = 'manual',
}

export enum InfluencerCouponStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  EXPIRED = 'expired',
}

export enum InfluencerCouponOwnerType {
  INFLUENCER = 'influencer',
  PRODUCT = 'product',
}

export enum InfluencerCouponProductDomain {
  COURSE = 'course',
  STORE_PACKAGE = 'store_package',
}

export enum InfluencerBillingProvider {
  GOOGLE_PLAY = 'google_play',
  APP_STORE = 'app_store',
}

export enum InfluencerOrderDomain {
  COURSE = 'course',
  STORE_PACKAGE = 'store_package',
}

export enum InfluencerAttributionStatus {
  PENDING = 'pending',
  CONVERTED = 'converted',
  REVERSED = 'reversed',
  CANCELLED = 'cancelled',
}

export enum InfluencerLedgerTransactionType {
  COMMISSION = 'commission',
  PAYOUT = 'payout',
  MANUAL_ADJUSTMENT = 'manual_adjustment',
  REVERSAL = 'reversal',
}

export enum InfluencerLedgerStatus {
  PENDING = 'pending',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

export enum InfluencerPartnerSortBy {
  CREATED_AT = 'createdAt',
  FULL_NAME = 'fullName',
  USERS_LINKED = 'usersLinked',
  TOTAL_SALES = 'totalSales',
  COMMISSION = 'commission',
}

export enum InfluencerSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export interface InfluencerCheckoutCouponResolution {
  valid: boolean;
  couponId: string;
  partnerId: string | null;
  partnerDisplayName: string | null;
  couponCode: string;
  ownerType: InfluencerCouponOwnerType;
  discountPercentage: number;
  influencerSharePercentage: number;
  lifetimeAssociationEnabled: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  provider: InfluencerBillingProvider;
  regularProviderProductId: string;
  discountedProviderProductId: string;
  providerBasePlanId: string | null;
  providerOfferId: string | null;
  basePriceEur: string;
  discountAmountEur: string;
  payableAmountEur: string;
  taxWarning: string;
}
