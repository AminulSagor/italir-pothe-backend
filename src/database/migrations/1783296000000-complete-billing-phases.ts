import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteBillingPhases1783296000000 implements MigrationInterface {
  name = 'CompleteBillingPhases1783296000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto"
    `);

    /*
     * Phase 1: refund operations
     */
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE
          "provider_refund_operations_orderdomain_enum"
        AS ENUM (
          'course',
          'package_store'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE
          "provider_refund_operations_provider_enum"
        AS ENUM (
          'google_play',
          'app_store'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE
          "provider_refund_operations_status_enum"
        AS ENUM (
          'pending',
          'processing',
          'provider_completed',
          'completed',
          'failed'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE
          "provider_refund_operations_source_enum"
        AS ENUM (
          'admin',
          'demo',
          'google_rtdn',
          'voided_reconciliation',
          'app_store_notification'
        );
      EXCEPTION
        WHEN duplicate_object THEN
          ALTER TYPE
            "provider_refund_operations_source_enum"
          ADD VALUE IF NOT EXISTS
            'app_store_notification';
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS
        "provider_refund_operations"
      (
        "id" uuid NOT NULL
          DEFAULT gen_random_uuid(),

        "orderDomain"
          "provider_refund_operations_orderdomain_enum"
          NOT NULL,

        "internalOrderId" uuid NOT NULL,

        "provider"
          "provider_refund_operations_provider_enum"
          NOT NULL,

        "providerOrderId"
          varchar(255)
          NOT NULL,

        "status"
          "provider_refund_operations_status_enum"
          NOT NULL
          DEFAULT 'pending',

        "source"
          "provider_refund_operations_source_enum"
          NOT NULL
          DEFAULT 'admin',

        "revoke" boolean NOT NULL DEFAULT true,

        "reason" varchar(500),

        "requestedByAdminId" uuid,

        "providerCompletedAt" timestamptz,

        "completedAt" timestamptz,

        "failureCode" varchar(80),

        "failureMessage" varchar(500),

        "createdAt" timestamptz
          NOT NULL DEFAULT now(),

        "updatedAt" timestamptz
          NOT NULL DEFAULT now(),

        CONSTRAINT
          "PK_provider_refund_operations"
        PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        "UQ_provider_refund_order_provider"
      ON "provider_refund_operations"
      (
        "orderDomain",
        "internalOrderId",
        "provider"
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
        "IDX_provider_refund_status_updated"
      ON "provider_refund_operations"
      (
        "status",
        "updatedAt"
      )
    `);

    /*
     * Phase 2: RTDN events
     */
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE
          "google_play_rtdn_events_notificationkind_enum"
        AS ENUM (
          'test',
          'subscription',
          'one_time_product',
          'voided_purchase'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE
          "google_play_rtdn_events_status_enum"
        AS ENUM (
          'pending',
          'processing',
          'processed',
          'failed',
          'dead_letter'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS
        "google_play_rtdn_events"
      (
        "id" uuid NOT NULL
          DEFAULT gen_random_uuid(),

        "messageId" varchar(255) NOT NULL,

        "pubsubSubscription" varchar(500),

        "publishTime" timestamptz,

        "packageName" varchar(255) NOT NULL,

        "eventTime" timestamptz NOT NULL,

        "notificationKind"
          "google_play_rtdn_events_notificationkind_enum"
          NOT NULL,

        "notificationType" integer,

        "productId" varchar(255),

        "providerOrderId" varchar(255),

        "purchaseTokenHash" varchar(64),

        "payloadCiphertext" text NOT NULL,

        "payloadIv" varchar(64) NOT NULL,

        "payloadAuthTag" varchar(64) NOT NULL,

        "pubsubAttributes" jsonb,

        "authoritativePayload" jsonb,

        "processingResult" jsonb,

        "status"
          "google_play_rtdn_events_status_enum"
          NOT NULL
          DEFAULT 'pending',

        "attemptCount" integer
          NOT NULL
          DEFAULT 0,

        "lastErrorCode" varchar(100),

        "lastErrorMessage" varchar(1000),

        "nextAttemptAt" timestamptz,

        "processingStartedAt" timestamptz,

        "processedAt" timestamptz,

        "receivedAt" timestamptz
          NOT NULL DEFAULT now(),

        "updatedAt" timestamptz
          NOT NULL DEFAULT now(),

        CONSTRAINT
          "PK_google_play_rtdn_events"
        PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        "UQ_google_play_rtdn_message"
      ON "google_play_rtdn_events"
      ("messageId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
        "IDX_google_play_rtdn_status_next"
      ON "google_play_rtdn_events"
      (
        "status",
        "nextAttemptAt"
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
        "IDX_google_play_rtdn_token"
      ON "google_play_rtdn_events"
      ("purchaseTokenHash")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
        "IDX_google_play_rtdn_order"
      ON "google_play_rtdn_events"
      ("providerOrderId")
    `);

    /*
     * Phase 3 wallet fields
     */
    await queryRunner.query(`
      ALTER TABLE "user_store_wallets"
      ADD COLUMN IF NOT EXISTS
        "aiVoiceSeconds"
        integer
        NOT NULL
        DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "user_store_wallets"
      ADD COLUMN IF NOT EXISTS
        "unlimitedStreakProtectionUntil"
        timestamptz
    `);

    /*
     * Phase 3 subscriptions
     */
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE
          "store_subscriptions_provider_enum"
        AS ENUM (
          'google_play',
          'app_store'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE
          "store_subscriptions_status_enum"
        AS ENUM (
          'pending',
          'active',
          'in_grace_period',
          'on_hold',
          'paused',
          'canceled',
          'expired',
          'revoked',
          'pending_purchase_canceled',
          'unknown'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE
          "store_subscriptions_entitlementstatus_enum"
        AS ENUM (
          'active',
          'suspended',
          'ended'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE
          "store_subscriptions_environment_enum"
        AS ENUM (
          'development',
          'sandbox',
          'production'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE
          "store_subscriptions_cancelrequesttype_enum"
        AS ENUM (
          'USER_REQUESTED_STOP_RENEWALS',
          'DEVELOPER_REQUESTED_STOP_PAYMENTS'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS
        "store_subscriptions"
      (
        "id" uuid NOT NULL
          DEFAULT gen_random_uuid(),

        "userId" uuid NOT NULL,

        "packageId" uuid NOT NULL,

        "initialOrderId" uuid NOT NULL,

        "provider"
          "store_subscriptions_provider_enum"
          NOT NULL,

        "productId" varchar(255) NOT NULL,

        "basePlanId" varchar(255),

        "offerId" varchar(255),

        "purchaseTokenHash"
          varchar(64)
          NOT NULL,

        "linkedPurchaseTokenHash"
          varchar(64),

        "previousPurchaseTokenHashes"
          jsonb
          NOT NULL
          DEFAULT '[]'::jsonb,

        "tokenCiphertext" text NOT NULL,

        "tokenIv" varchar(64) NOT NULL,

        "tokenAuthTag" varchar(64) NOT NULL,

        "latestOrderId" varchar(255),

        "status"
          "store_subscriptions_status_enum"
          NOT NULL,

        "rawSubscriptionState"
          varchar(80)
          NOT NULL,

        "entitlementStatus"
          "store_subscriptions_entitlementstatus_enum"
          NOT NULL,

        "entitlementActive"
          boolean
          NOT NULL
          DEFAULT false,

        "autoRenewEnabled"
          boolean
          NOT NULL
          DEFAULT false,

        "startedAt" timestamptz,

        "expiresAt" timestamptz,

        "pausedResumeAt" timestamptz,

        "canceledAt" timestamptz,

        "revokedAt" timestamptz,

        "expiredAt" timestamptz,

        "environment"
          "store_subscriptions_environment_enum"
          NOT NULL,

        "isTestPurchase"
          boolean
          NOT NULL
          DEFAULT false,

        "regionCode" varchar(8),

        "cancellationReason" varchar(80),

        "lastNotificationType" integer,

        "lastRtdnEventId" uuid,

        "lastEventTime" timestamptz,

        "lastSyncedAt" timestamptz NOT NULL,

        "cancelRequestedAt" timestamptz,

        "cancelRequestedByAdminId" uuid,

        "cancelRequestType"
          "store_subscriptions_cancelrequesttype_enum",

        "latestPayload" jsonb,

        "createdAt" timestamptz
          NOT NULL DEFAULT now(),

        "updatedAt" timestamptz
          NOT NULL DEFAULT now(),

        CONSTRAINT
          "PK_store_subscriptions"
        PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        "UQ_store_subscriptions_initial_order"
      ON "store_subscriptions"
      ("initialOrderId")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        "UQ_store_subscriptions_token_hash"
      ON "store_subscriptions"
      ("purchaseTokenHash")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
        "IDX_store_subscriptions_user_entitlement_expiry"
      ON "store_subscriptions"
      (
        "userId",
        "entitlementActive",
        "expiresAt"
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
        "IDX_store_subscriptions_status_expiry"
      ON "store_subscriptions"
      (
        "status",
        "expiresAt"
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE
          "store_subscription_renewals_provider_enum"
        AS ENUM (
          'google_play',
          'app_store'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE
          "store_subscription_renewals_eventtype_enum"
        AS ENUM (
          'initial_purchase',
          'renewal',
          'recovery',
          'restart',
          'deferred',
          'items_changed',
          'manual_sync'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE
          "store_subscription_renewals_status_enum"
        AS ENUM (
          'active',
          'refunded',
          'revoked'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS
        "store_subscription_renewals"
      (
        "id" uuid NOT NULL
          DEFAULT gen_random_uuid(),

        "subscriptionId" uuid NOT NULL,

        "provider"
          "store_subscription_renewals_provider_enum"
          NOT NULL
          DEFAULT 'google_play',

        "providerOrderId"
          varchar(255)
          NOT NULL,

        "productId" varchar(255) NOT NULL,

        "basePlanId" varchar(255),

        "offerId" varchar(255),

        "eventType"
          "store_subscription_renewals_eventtype_enum"
          NOT NULL,

        "status"
          "store_subscription_renewals_status_enum"
          NOT NULL,

        "periodStart" timestamptz,

        "periodEnd" timestamptz NOT NULL,

        "priceCurrency" varchar(8),

        "priceUnits" varchar(40),

        "priceNanos" integer,

        "notificationType" integer,

        "rtdnEventId" uuid,

        "rawSubscriptionState"
          varchar(80)
          NOT NULL,

        "isTestPurchase"
          boolean
          NOT NULL
          DEFAULT false,

        "createdAt" timestamptz
          NOT NULL DEFAULT now(),

        "updatedAt" timestamptz
          NOT NULL DEFAULT now(),

        CONSTRAINT
          "PK_store_subscription_renewals"
        PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE
        "store_subscription_renewals"
      ADD COLUMN IF NOT EXISTS
        "provider"
        "store_subscription_renewals_provider_enum"
        NOT NULL
        DEFAULT 'google_play'
    `);

    /*
     * Remove the old providerOrderId-only unique index,
     * regardless of its generated TypeORM hash name.
     */
    await queryRunner.query(`
      DO $$
      DECLARE
        index_record record;
      BEGIN
        FOR index_record IN
          SELECT indexname
          FROM pg_indexes
          WHERE tablename =
            'store_subscription_renewals'
          AND indexdef LIKE
            'CREATE UNIQUE INDEX%'
          AND indexdef LIKE
            '%("providerOrderId")%'
          AND indexdef NOT LIKE
            '%"provider", "providerOrderId"%'
        LOOP
          EXECUTE
            'DROP INDEX IF EXISTS ' ||
            quote_ident(index_record.indexname);
        END LOOP;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        "UQ_store_subscription_renewals_provider_order"
      ON "store_subscription_renewals"
      (
        "provider",
        "providerOrderId"
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
        "IDX_store_subscription_renewals_subscription_period"
      ON "store_subscription_renewals"
      (
        "subscriptionId",
        "periodEnd"
      )
    `);

    /*
     * Phase 4 reconciliation
     */
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE
          "google_play_reconciliation_checkpoints_key_enum"
        AS ENUM (
          'voided_purchases'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE
          "google_play_voided_purchase_records_matcheddomain_enum"
        AS ENUM (
          'subscription',
          'course',
          'package_store',
          'unknown'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE
          "google_play_voided_purchase_records_status_enum"
        AS ENUM (
          'pending',
          'processing',
          'processed',
          'unmatched',
          'manual_review',
          'failed',
          'dead_letter'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS
        "google_play_reconciliation_checkpoints"
      (
        "key"
          "google_play_reconciliation_checkpoints_key_enum"
          NOT NULL,

        "lastSuccessfulEndTime" timestamptz,

        "lastStartedAt" timestamptz,

        "lastCompletedAt" timestamptz,

        "lastFailedAt" timestamptz,

        "leaseOwner" uuid,

        "leaseExpiresAt" timestamptz,

        "lastErrorMessage" varchar(1000),

        "lastResult" jsonb,

        "createdAt" timestamptz
          NOT NULL DEFAULT now(),

        "updatedAt" timestamptz
          NOT NULL DEFAULT now(),

        CONSTRAINT
          "PK_google_play_reconciliation_checkpoints"
        PRIMARY KEY ("key")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS
        "google_play_voided_purchase_records"
      (
        "id" uuid NOT NULL
          DEFAULT gen_random_uuid(),

        "fingerprint" varchar(64) NOT NULL,

        "providerOrderId"
          varchar(255)
          NOT NULL,

        "purchaseTokenHash"
          varchar(64)
          NOT NULL,

        "purchaseTime" timestamptz,

        "voidedTime" timestamptz NOT NULL,

        "voidedReason" integer,

        "voidedSource" integer,

        "voidedQuantity" integer,

        "payloadCiphertext" text NOT NULL,

        "payloadIv" varchar(64) NOT NULL,

        "payloadAuthTag" varchar(64) NOT NULL,

        "matchedDomain"
          "google_play_voided_purchase_records_matcheddomain_enum"
          NOT NULL
          DEFAULT 'unknown',

        "internalOrderId" uuid,

        "status"
          "google_play_voided_purchase_records_status_enum"
          NOT NULL
          DEFAULT 'pending',

        "attemptCount"
          integer
          NOT NULL
          DEFAULT 0,

        "processingResult" jsonb,

        "lastErrorCode" varchar(100),

        "lastErrorMessage" varchar(1000),

        "nextAttemptAt" timestamptz,

        "processingStartedAt" timestamptz,

        "processedAt" timestamptz,

        "discoveredAt" timestamptz
          NOT NULL DEFAULT now(),

        "updatedAt" timestamptz
          NOT NULL DEFAULT now(),

        CONSTRAINT
          "PK_google_play_voided_purchase_records"
        PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        "UQ_google_play_voided_fingerprint"
      ON "google_play_voided_purchase_records"
      ("fingerprint")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
        "IDX_google_play_voided_status_next"
      ON "google_play_voided_purchase_records"
      (
        "status",
        "nextAttemptAt"
      )
    `);

    /*
     * Phase 5 notification persistence
     */
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE
          "app_store_server_notification_events_environment_enum"
        AS ENUM (
          'development',
          'sandbox',
          'production'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE
          "app_store_server_notification_events_status_enum"
        AS ENUM (
          'pending',
          'processing',
          'processed',
          'failed',
          'dead_letter'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS
        "app_store_server_notification_events"
      (
        "id" uuid NOT NULL
          DEFAULT gen_random_uuid(),

        "notificationUuid" uuid NOT NULL,

        "notificationType"
          varchar(80)
          NOT NULL,

        "subtype" varchar(80),

        "environment"
          "app_store_server_notification_events_environment_enum"
          NOT NULL,

        "signedDate" timestamptz NOT NULL,

        "signedPayloadHash"
          varchar(64)
          NOT NULL,

        "transactionId" varchar(255),

        "originalTransactionId"
          varchar(255),

        "productId" varchar(255),

        "appAccountToken" uuid,

        "payloadCiphertext" text NOT NULL,

        "payloadIv" varchar(64) NOT NULL,

        "payloadAuthTag" varchar(64) NOT NULL,

        "sanitizedPayload"
          jsonb
          NOT NULL,

        "processingResult" jsonb,

        "status"
          "app_store_server_notification_events_status_enum"
          NOT NULL
          DEFAULT 'pending',

        "attemptCount"
          integer
          NOT NULL
          DEFAULT 0,

        "lastErrorCode" varchar(100),

        "lastErrorMessage" varchar(1000),

        "nextAttemptAt" timestamptz,

        "processingStartedAt" timestamptz,

        "processedAt" timestamptz,

        "receivedAt" timestamptz
          NOT NULL DEFAULT now(),

        "updatedAt" timestamptz
          NOT NULL DEFAULT now(),

        CONSTRAINT
          "PK_app_store_server_notification_events"
        PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        "UQ_app_store_notification_uuid"
      ON "app_store_server_notification_events"
      ("notificationUuid")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        "UQ_app_store_payload_hash"
      ON "app_store_server_notification_events"
      ("signedPayloadHash")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
        "IDX_app_store_notification_status_next"
      ON "app_store_server_notification_events"
      (
        "status",
        "nextAttemptAt"
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
        "IDX_app_store_notification_transaction"
      ON "app_store_server_notification_events"
      ("transactionId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
        "IDX_app_store_notification_original_transaction"
      ON "app_store_server_notification_events"
      ("originalTransactionId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS
        "app_store_server_notification_events"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS
        "google_play_voided_purchase_records"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS
        "google_play_reconciliation_checkpoints"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS
        "store_subscription_renewals"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS
        "store_subscriptions"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS
        "google_play_rtdn_events"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS
        "provider_refund_operations"
    `);

    await queryRunner.query(`
      ALTER TABLE "user_store_wallets"
      DROP COLUMN IF EXISTS
        "unlimitedStreakProtectionUntil"
    `);

    await queryRunner.query(`
      ALTER TABLE "user_store_wallets"
      DROP COLUMN IF EXISTS
        "aiVoiceSeconds"
    `);
  }
}
