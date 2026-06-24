import { CommerceCurrency } from 'src/module-2/course-commerce/types/course-commerce.type';

export enum StorePackageType {
  AI_BUNDLE = 'ai_bundle',
  STREAK_FREEZE = 'streak_freeze',
  CV_CREDIT = 'cv_credit',
}

export enum StorePackageStatus {
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum StoreMarketingBadge {
  NONE = 'none',
  LIMITED_TIME = 'limited_time',
  MOST_POPULAR = 'most_popular',
  BEST_VALUE = 'best_value',
}

export enum StoreBillingModel {
  ONE_TIME = 'one_time',
  MONTHLY = 'monthly',
}

export enum StreakProtectionMode {
  FINITE = 'finite',
  MONTHLY_UNLIMITED = 'monthly_unlimited',
}

export enum StorePaymentProvider {
  GOOGLE_PLAY = 'google_play',
  STRIPE = 'stripe',
}

export enum StoreOrderStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum StoreTimelineEventType {
  ORDER_PLACED = 'order_placed',
  PAYMENT_PROCESSED = 'payment_processed',
  PAYMENT_FAILED = 'payment_failed',
  ENTITLEMENT_GRANTED = 'entitlement_granted',
  REFUND_PROCESSED = 'refund_processed',
}

export enum StoreSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum StorePublicPackageSortBy {
  SORT_ORDER = 'sortOrder',
  PRICE = 'priceEur',
  NAME = 'name',
  CREATED_AT = 'createdAt',
}

export enum PurchaseHistoryCategory {
  ALL = 'all',
  COURSE = 'course',
  AI_REFILL = 'ai_refill',
  STREAK_FREEZE = 'streak_freeze',
  CV_CREDIT = 'cv_credit',
}

export enum PurchaseHistorySortBy {
  PURCHASED_AT = 'purchasedAt',
  AMOUNT = 'amount',
  NAME = 'name',
}

export enum CheckoutPaymentMethod {
  GOOGLE_PLAY = 'google_play',
  CARD = 'card',
  PAYPAL = 'paypal',
  APPLE_PAY = 'apple_pay',
  BKASH = 'bkash',
}

export interface StoreTimelineItem {
  eventType: StoreTimelineEventType;
  title: string;
  description: string | null;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

export interface StoreQuote {
  basePriceEur: string;
  couponCode: string | null;
  discountPercentage: number;
  discountAmountEur: string;
  totalAmountEur: string;

  selectedCurrency: CommerceCurrency;
  forexRate: string | null;

  originalAmount: string;
  discountAmount: string;
  totalAmount: string;
}

export interface StorePackageResponse {
  id: string;
  type: StorePackageType;
  name: string;
  description: string | null;
  priceEur: string;
  billingModel: StoreBillingModel;
  marketingBadge: StoreMarketingBadge | null;

  aiVoiceMinutes: number;
  aiTextTokens: number;

  cvCredits: number;

  streakFreezeCount: number;
  streakProtectionMode: StreakProtectionMode | null;
  protectionDurationDays: number | null;

  couponEnabled: boolean;
  couponCode: string | null;

  sortOrder: number;
}
