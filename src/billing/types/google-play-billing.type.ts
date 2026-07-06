export type GooglePlayPurchaseState =
  | 'PURCHASE_STATE_UNSPECIFIED'
  | 'PURCHASED'
  | 'CANCELLED'
  | 'PENDING';

export type GooglePlayAcknowledgementState =
  | 'ACKNOWLEDGEMENT_STATE_UNSPECIFIED'
  | 'ACKNOWLEDGEMENT_STATE_PENDING'
  | 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';

export type GooglePlayConsumptionState =
  | 'CONSUMPTION_STATE_UNSPECIFIED'
  | 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'
  | 'CONSUMPTION_STATE_CONSUMED';

export interface GooglePlayMoney {
  currencyCode?: string;
  units?: string;
  nanos?: number;
}

export interface GooglePlayProductOfferDetails {
  offerTags?: string[];
  offerId?: string;
  purchaseOptionId?: string;
  offerToken?: string;
  quantity?: number;
  refundableQuantity?: number;
  consumptionState?: GooglePlayConsumptionState;
}

export interface GooglePlayProductLineItem {
  productId?: string;

  productOfferDetails?: GooglePlayProductOfferDetails;
}

export interface GooglePlayProductPurchaseV2 {
  kind?: string;

  productLineItem?: GooglePlayProductLineItem[];

  purchaseStateContext?: {
    purchaseState?: GooglePlayPurchaseState;
  };

  testPurchaseContext?: {
    fopType?: 'FOP_TYPE_UNSPECIFIED' | 'TEST';
  } | null;

  orderId?: string;

  obfuscatedExternalAccountId?: string;

  obfuscatedExternalProfileId?: string;

  regionCode?: string;

  purchaseCompletionTime?: string;

  acknowledgementState?: GooglePlayAcknowledgementState;
}

export type GooglePlaySubscriptionState =
  | 'SUBSCRIPTION_STATE_UNSPECIFIED'
  | 'SUBSCRIPTION_STATE_PENDING'
  | 'SUBSCRIPTION_STATE_ACTIVE'
  | 'SUBSCRIPTION_STATE_PAUSED'
  | 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
  | 'SUBSCRIPTION_STATE_ON_HOLD'
  | 'SUBSCRIPTION_STATE_CANCELED'
  | 'SUBSCRIPTION_STATE_EXPIRED'
  | 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED';

export interface GooglePlaySubscriptionLineItem {
  productId?: string;

  expiryTime?: string;

  latestSuccessfulOrderId?: string;

  autoRenewingPlan?: {
    autoRenewEnabled?: boolean;

    recurringPrice?: GooglePlayMoney;
  };

  offerDetails?: {
    basePlanId?: string;

    offerId?: string;

    offerTags?: string[];
  };
}

export interface GooglePlayCanceledStateContext {
  userInitiatedCancellation?: {
    cancelTime?: string;

    cancelSurveyResult?: {
      reason?: string;

      reasonUserInput?: string;
    };
  };

  systemInitiatedCancellation?: Record<string, never>;

  developerInitiatedCancellation?: Record<string, never>;

  replacementCancellation?: Record<string, never>;
}

export interface GooglePlaySubscriptionPurchaseV2 {
  kind?: string;

  regionCode?: string;

  startTime?: string;

  subscriptionState?: GooglePlaySubscriptionState;

  latestOrderId?: string;

  linkedPurchaseToken?: string | null;

  pausedStateContext?: {
    autoResumeTime?: string;
  } | null;

  canceledStateContext?: GooglePlayCanceledStateContext | null;

  acknowledgementState?: GooglePlayAcknowledgementState;

  testPurchase?: Record<string, never> | null;

  externalAccountIdentifiers?: {
    externalAccountId?: string;

    obfuscatedExternalAccountId?: string;

    obfuscatedExternalProfileId?: string;
  } | null;

  lineItems?: GooglePlaySubscriptionLineItem[];
}

export interface VerifiedGooglePlayOneTimeProduct {
  provider: 'google_play';

  packageName: string;

  productId: string;

  purchaseOptionId: string | null;

  offerId: string | null;

  orderId: string | null;

  purchaseTokenHash: string;

  purchaseState: 'PURCHASED';

  acknowledgementState: GooglePlayAcknowledgementState;

  consumptionState: GooglePlayConsumptionState;

  quantity: number;

  refundableQuantity: number | null;

  purchaseCompletionTime: string;

  regionCode: string | null;

  obfuscatedExternalAccountId: string | null;

  obfuscatedExternalProfileId: string | null;

  isTestPurchase: boolean;
}

export interface VerifiedGooglePlaySubscription {
  provider: 'google_play';

  packageName: string;

  productId: string;

  basePlanId: string | null;

  offerId: string | null;

  latestOrderId: string | null;

  purchaseTokenHash: string;

  subscriptionState: GooglePlaySubscriptionState;

  acknowledgementState: GooglePlayAcknowledgementState;

  startedAt: string | null;

  expiresAt: string;

  autoRenewEnabled: boolean;

  regionCode: string | null;

  obfuscatedExternalAccountId: string | null;

  obfuscatedExternalProfileId: string | null;

  isTestPurchase: boolean;
}

export interface GooglePlayVoidedPurchase {
  kind?: string;

  orderId?: string;

  purchaseTimeMillis?: string;

  purchaseToken?: string;

  voidedTimeMillis?: string;

  voidedReason?: number;

  voidedSource?: number;

  voidedQuantity?: number;
}

export interface GooglePlayVoidedPurchasesListResponse {
  pageInfo?: {
    totalResults?: number;
    resultPerPage?: number;
    startIndex?: number;
  };

  tokenPagination?: {
    nextPageToken?: string;
    previousPageToken?: string;
  };

  voidedPurchases?: GooglePlayVoidedPurchase[];
}
