export enum CommerceCurrency {
  EUR = 'EUR',
  BDT = 'BDT',
}

export enum CoursePaymentProvider {
  GOOGLE_PLAY = 'google_play',
  APP_STORE = 'app_store',
}

export const ADMIN_EXTERNAL_PAYMENT_PROVIDER = 'admin_external';

export enum AdminExternalPaymentMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  MOBILE_BANKING = 'mobile_banking',
  CARD = 'card',
  OTHER = 'other',
}

export enum CourseProviderProductType {
  NON_CONSUMABLE = 'non_consumable',
}

export enum CourseProviderEnvironment {
  DEVELOPMENT = 'development',
  SANDBOX = 'sandbox',
  PRODUCTION = 'production',
}

export enum CourseProviderVerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  FAILED = 'failed',
}

export enum CoursePurchaseStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PAID = 'paid',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum CoursePaymentAttemptStatus {
  CREATED = 'created',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum CourseEnrollmentStatus {
  ACTIVE = 'active',
  REFUNDED = 'refunded',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

export enum CourseAccessType {
  LIFETIME = 'lifetime',
}

export enum CommerceSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export interface CourseProviderProductResponse {
  id: string;
  provider: CoursePaymentProvider;
  productId: string;
  productType: CourseProviderProductType;
  basePlanId: string | null;
  offerId: string | null;
  isActive: boolean;
}
