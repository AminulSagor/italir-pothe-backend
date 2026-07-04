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
  };

  orderId?: string;

  obfuscatedExternalAccountId?: string;

  obfuscatedExternalProfileId?: string;

  regionCode?: string;

  purchaseCompletionTime?: string;

  acknowledgementState?: GooglePlayAcknowledgementState;
}

export interface VerifyGooglePlayOneTimeProductParams {
  purchaseToken: string;

  expectedProductId: string;

  expectedPurchaseOptionId?: string | null;

  expectedObfuscatedAccountId?: string | null;
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
