export enum GooglePlayRtdnNotificationKind {
  TEST = 'test',
  SUBSCRIPTION = 'subscription',
  ONE_TIME_PRODUCT = 'one_time_product',
  VOIDED_PURCHASE = 'voided_purchase',
}

export enum GooglePlayRtdnEventStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
}

export enum GooglePlaySubscriptionNotificationType {
  RECOVERED = 1,
  RENEWED = 2,
  CANCELED = 3,
  PURCHASED = 4,
  ON_HOLD = 5,
  IN_GRACE_PERIOD = 6,
  RESTARTED = 7,
  PRICE_CHANGE_CONFIRMED_DEPRECATED = 8,
  DEFERRED = 9,
  PAUSED = 10,
  PAUSE_SCHEDULE_CHANGED = 11,
  REVOKED = 12,
  EXPIRED = 13,
  ITEMS_CHANGED = 17,
  CANCELLATION_SCHEDULED = 18,
  PRICE_CHANGE_UPDATED = 19,
  PENDING_PURCHASE_CANCELED = 20,
  PRICE_STEP_UP_CONSENT_UPDATED = 22,
}

export enum GooglePlayOneTimeProductNotificationType {
  PURCHASED = 1,
  CANCELED = 2,
}

export enum GooglePlayVoidedProductType {
  SUBSCRIPTION = 1,
  ONE_TIME_PRODUCT = 2,
}

export enum GooglePlayVoidedRefundType {
  FULL_REFUND = 1,
  QUANTITY_BASED_PARTIAL_REFUND = 2,
}

export interface GooglePlaySubscriptionNotification {
  version: string;

  notificationType: GooglePlaySubscriptionNotificationType;

  purchaseToken: string;
}

export interface GooglePlayOneTimeProductNotification {
  version: string;

  notificationType: GooglePlayOneTimeProductNotificationType;

  purchaseToken: string;

  sku: string;
}

export interface GooglePlayVoidedPurchaseNotification {
  purchaseToken: string;

  orderId: string;

  productType: GooglePlayVoidedProductType;

  refundType: GooglePlayVoidedRefundType;
}

export interface GooglePlayTestNotification {
  version: string;
}

export interface GooglePlayDeveloperNotification {
  version: string;

  packageName: string;

  eventTimeMillis: string;

  subscriptionNotification?: GooglePlaySubscriptionNotification;

  oneTimeProductNotification?: GooglePlayOneTimeProductNotification;

  voidedPurchaseNotification?: GooglePlayVoidedPurchaseNotification;

  testNotification?: GooglePlayTestNotification;
}

export interface GooglePubSubPushMessage {
  data: string;

  messageId?: string;

  message_id?: string;

  publishTime?: string;

  publish_time?: string;

  attributes?: Record<string, string>;
}

export interface GooglePubSubPushEnvelope {
  message: GooglePubSubPushMessage;

  subscription?: string;
}

export interface EncryptedGooglePlayPayload {
  ciphertext: string;

  iv: string;

  authTag: string;
}

export interface GooglePlayRtdnProcessingOutput {
  authoritativePayload: Record<string, unknown> | null;

  result: Record<string, unknown>;
}
