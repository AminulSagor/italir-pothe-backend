export enum CommerceCurrency {
  EUR = 'EUR',
  BDT = 'BDT',
}

export enum CoursePaymentProvider {
  GOOGLE_PLAY = 'google_play',
  STRIPE = 'stripe',
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
