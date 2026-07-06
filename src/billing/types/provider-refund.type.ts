export enum BillingOrderDomain {
  COURSE = 'course',
  PACKAGE_STORE = 'package_store',
}

export enum BillingPaymentProvider {
  GOOGLE_PLAY = 'google_play',
  APP_STORE = 'app_store',
}

export enum ProviderRefundStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PROVIDER_COMPLETED = 'provider_completed',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum ProviderRefundSource {
  ADMIN = 'admin',
  DEMO = 'demo',
  GOOGLE_RTDN = 'google_rtdn',
  VOIDED_RECONCILIATION = 'voided_reconciliation',
}
