export enum StoreSubscriptionStatus {
  PENDING = 'pending',

  ACTIVE = 'active',

  IN_GRACE_PERIOD = 'in_grace_period',

  ON_HOLD = 'on_hold',

  PAUSED = 'paused',

  CANCELED = 'canceled',

  EXPIRED = 'expired',

  REVOKED = 'revoked',

  PENDING_PURCHASE_CANCELED = 'pending_purchase_canceled',

  UNKNOWN = 'unknown',
}

export enum StoreSubscriptionEntitlementStatus {
  ACTIVE = 'active',

  SUSPENDED = 'suspended',

  ENDED = 'ended',
}

export enum StoreSubscriptionRenewalEventType {
  INITIAL_PURCHASE = 'initial_purchase',

  RENEWAL = 'renewal',

  RECOVERY = 'recovery',

  RESTART = 'restart',

  DEFERRED = 'deferred',

  ITEMS_CHANGED = 'items_changed',

  MANUAL_SYNC = 'manual_sync',
}

export enum StoreSubscriptionRenewalStatus {
  ACTIVE = 'active',

  REFUNDED = 'refunded',

  REVOKED = 'revoked',
}

export enum GooglePlayDeveloperCancellationType {
  USER_REQUESTED_STOP_RENEWALS = 'USER_REQUESTED_STOP_RENEWALS',

  DEVELOPER_REQUESTED_STOP_PAYMENTS = 'DEVELOPER_REQUESTED_STOP_PAYMENTS',
}
