import type {
  Environment,
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
  NotificationTypeV2,
  ResponseBodyV2DecodedPayload,
  Status,
  Subtype,
  Type,
} from '@apple/app-store-server-library';

export enum AppStoreNotificationEventStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
}

export interface VerifiedAppStoreTransaction {
  transactionId: string;

  originalTransactionId: string;

  productId: string;

  appAccountToken: string | null;

  type: Type | string;

  environment: Environment | string;

  purchaseDate: Date | null;

  originalPurchaseDate: Date | null;

  expiresDate: Date | null;

  quantity: number;

  revocationDate: Date | null;

  revocationReason: number | null;

  currency: string | null;

  priceMilliunits: number | null;

  storefront: string | null;

  signedTransactionHash: string;

  decoded: JWSTransactionDecodedPayload;

  sanitizedPayload: Record<string, unknown>;
}

export interface VerifiedAppStoreNotification {
  notificationUuid: string;

  notificationType: NotificationTypeV2 | string;

  subtype: Subtype | string | null;

  environment: Environment | string;

  signedDate: Date;

  status: Status | number | null;

  transaction: JWSTransactionDecodedPayload | null;

  renewalInfo: JWSRenewalInfoDecodedPayload | null;

  decoded: ResponseBodyV2DecodedPayload;

  signedPayloadHash: string;

  sanitizedPayload: Record<string, unknown>;
}
