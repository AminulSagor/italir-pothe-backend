export enum GooglePlayReconciliationJobKey {
  VOIDED_PURCHASES = 'voided_purchases',
}

export enum GooglePlayVoidedRecordStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  UNMATCHED = 'unmatched',
  MANUAL_REVIEW = 'manual_review',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
}

export enum GooglePlayVoidedRecordDomain {
  SUBSCRIPTION = 'subscription',
  COURSE = 'course',
  PACKAGE_STORE = 'package_store',
  UNKNOWN = 'unknown',
}

export interface GooglePlayVoidedReconciliationSummary {
  alreadyRunning: boolean;

  windowStart: Date | null;

  windowEnd: Date | null;

  pagesFetched: number;

  recordsSeen: number;

  recordsInserted: number;

  recordsProcessed: number;

  recordsUnmatched: number;

  recordsFailed: number;
}
