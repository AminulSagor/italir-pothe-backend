import { MigrationInterface, QueryRunner } from 'typeorm';

export class InfluencerHubComplete1783382400000 implements MigrationInterface {
  name = 'InfluencerHubComplete1783382400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "influencer_partners_status_enum" AS ENUM ('active', 'inactive', 'suspended');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE "influencer_partners_paymentmethod_enum" AS ENUM ('bank_transfer', 'paypal', 'wise', 'manual');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE "influencer_social_handles_platform_enum" AS ENUM ('instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', 'website', 'other');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE "influencer_coupons_ownertype_enum" AS ENUM ('influencer', 'product');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE "influencer_coupons_status_enum" AS ENUM ('draft', 'active', 'paused', 'expired');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE "influencer_coupon_provider_mappings_productdomain_enum" AS ENUM ('course', 'store_package');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE "influencer_coupon_provider_mappings_provider_enum" AS ENUM ('google_play', 'app_store');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE "influencer_order_attributions_orderdomain_enum" AS ENUM ('course', 'store_package');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE "influencer_order_attributions_ownertype_enum" AS ENUM ('influencer', 'product');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE "influencer_order_attributions_provider_enum" AS ENUM ('google_play', 'app_store');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE "influencer_order_attributions_status_enum" AS ENUM ('pending', 'converted', 'reversed', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE "influencer_ledger_entries_orderdomain_enum" AS ENUM ('course', 'store_package');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE "influencer_ledger_entries_transactiontype_enum" AS ENUM ('commission', 'payout', 'manual_adjustment', 'reversal');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE "influencer_ledger_entries_status_enum" AS ENUM ('pending', 'paid', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "influencer_partners" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "fullName" varchar(180) NOT NULL,
        "email" varchar(255) NOT NULL,
        "title" varchar(160),
        "avatarUrl" text,
        "status" "influencer_partners_status_enum" NOT NULL DEFAULT 'active',
        "paymentMethod" "influencer_partners_paymentmethod_enum" NOT NULL DEFAULT 'bank_transfer',
        "paymentDetails" jsonb,
        "paymentDisplayLabel" varchar(180),
        "currency" varchar(3) NOT NULL DEFAULT 'EUR',
        "administrativeNotes" text,
        "lastActivityAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_influencer_partners" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_influencer_partners_email" UNIQUE ("email")
      );

      CREATE INDEX IF NOT EXISTS "IDX_influencer_partners_status_created" ON "influencer_partners" ("status", "createdAt");

      CREATE TABLE IF NOT EXISTS "influencer_social_handles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "partnerId" uuid NOT NULL,
        "platform" "influencer_social_handles_platform_enum" NOT NULL,
        "handle" varchar(180) NOT NULL,
        "url" text,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_influencer_social_handles" PRIMARY KEY ("id"),
        CONSTRAINT "FK_influencer_social_handles_partner" FOREIGN KEY ("partnerId") REFERENCES "influencer_partners"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_influencer_social_handles_partner_platform_handle" UNIQUE ("partnerId", "platform", "handle")
      );

      CREATE TABLE IF NOT EXISTS "influencer_coupons" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "partnerId" uuid,
        "couponCode" varchar(80) NOT NULL,
        "ownerType" "influencer_coupons_ownertype_enum" NOT NULL DEFAULT 'influencer',
        "userDiscountPercentage" smallint NOT NULL,
        "influencerSharePercentage" smallint NOT NULL DEFAULT 0,
        "lifetimeAssociationEnabled" boolean NOT NULL DEFAULT true,
        "status" "influencer_coupons_status_enum" NOT NULL DEFAULT 'active',
        "startsAt" timestamptz,
        "expiresAt" timestamptz,
        "notes" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_influencer_coupons" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_influencer_coupons_code" UNIQUE ("couponCode"),
        CONSTRAINT "FK_influencer_coupons_partner" FOREIGN KEY ("partnerId") REFERENCES "influencer_partners"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_influencer_coupons_percentages" CHECK ("userDiscountPercentage" BETWEEN 1 AND 99 AND "influencerSharePercentage" BETWEEN 0 AND 99),
        CONSTRAINT "CHK_influencer_coupons_dates" CHECK ("startsAt" IS NULL OR "expiresAt" IS NULL OR "startsAt" < "expiresAt")
      );

      CREATE INDEX IF NOT EXISTS "IDX_influencer_coupons_status_dates" ON "influencer_coupons" ("status", "startsAt", "expiresAt");

      CREATE TABLE IF NOT EXISTS "influencer_coupon_provider_mappings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "couponId" uuid NOT NULL,
        "productDomain" "influencer_coupon_provider_mappings_productdomain_enum" NOT NULL,
        "courseId" uuid,
        "storePackageId" uuid,
        "provider" "influencer_coupon_provider_mappings_provider_enum" NOT NULL,
        "regularProviderProductId" varchar(255) NOT NULL,
        "discountedProviderProductId" varchar(255) NOT NULL,
        "providerBasePlanId" varchar(255),
        "providerOfferId" varchar(255),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_influencer_coupon_provider_mappings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_influencer_coupon_provider_mappings_coupon" FOREIGN KEY ("couponId") REFERENCES "influencer_coupons"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_influencer_coupon_mapping_product" CHECK (("productDomain" = 'course' AND "courseId" IS NOT NULL AND "storePackageId" IS NULL) OR ("productDomain" = 'store_package' AND "storePackageId" IS NOT NULL AND "courseId" IS NULL)),
        CONSTRAINT "CHK_influencer_coupon_mapping_products_different" CHECK ("regularProviderProductId" <> "discountedProviderProductId")
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_influencer_coupon_mapping_course" ON "influencer_coupon_provider_mappings" ("couponId", "productDomain", "courseId", "provider") WHERE "courseId" IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_influencer_coupon_mapping_store_package" ON "influencer_coupon_provider_mappings" ("couponId", "productDomain", "storePackageId", "provider") WHERE "storePackageId" IS NOT NULL;
      CREATE INDEX IF NOT EXISTS "IDX_influencer_coupon_mapping_product" ON "influencer_coupon_provider_mappings" ("productDomain", "courseId", "storePackageId", "provider");

      CREATE TABLE IF NOT EXISTS "influencer_order_attributions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "partnerId" uuid,
        "couponId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "orderDomain" "influencer_order_attributions_orderdomain_enum" NOT NULL,
        "orderId" uuid NOT NULL,
        "productId" uuid NOT NULL,
        "couponCode" varchar(80) NOT NULL,
        "ownerType" "influencer_order_attributions_ownertype_enum" NOT NULL,
        "provider" "influencer_order_attributions_provider_enum" NOT NULL,
        "regularProviderProductId" varchar(255) NOT NULL,
        "chargedProviderProductId" varchar(255) NOT NULL,
        "baseAmountEur" numeric(10,2) NOT NULL,
        "discountPercentage" smallint NOT NULL,
        "discountAmountEur" numeric(10,2) NOT NULL,
        "payableAmountEur" numeric(10,2) NOT NULL,
        "influencerSharePercentage" smallint NOT NULL DEFAULT 0,
        "commissionAmountEur" numeric(10,2) NOT NULL DEFAULT '0.00',
        "status" "influencer_order_attributions_status_enum" NOT NULL DEFAULT 'pending',
        "convertedAt" timestamptz,
        "reversedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_influencer_order_attributions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_influencer_order_attributions_order" UNIQUE ("orderDomain", "orderId"),
        CONSTRAINT "FK_influencer_order_attributions_partner" FOREIGN KEY ("partnerId") REFERENCES "influencer_partners"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_influencer_order_attributions_coupon" FOREIGN KEY ("couponId") REFERENCES "influencer_coupons"("id") ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS "IDX_influencer_order_attributions_partner_status_created" ON "influencer_order_attributions" ("partnerId", "status", "createdAt");
      CREATE INDEX IF NOT EXISTS "IDX_influencer_order_attributions_coupon_created" ON "influencer_order_attributions" ("couponCode", "createdAt");

      CREATE TABLE IF NOT EXISTS "influencer_ledger_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "partnerId" uuid NOT NULL,
        "couponId" uuid,
        "attributionId" uuid,
        "orderDomain" "influencer_ledger_entries_orderdomain_enum",
        "orderId" uuid,
        "transactionType" "influencer_ledger_entries_transactiontype_enum" NOT NULL,
        "referenceId" varchar(120) NOT NULL,
        "amountEur" numeric(10,2) NOT NULL,
        "status" "influencer_ledger_entries_status_enum" NOT NULL DEFAULT 'pending',
        "notes" text,
        "transactionDate" timestamptz NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_influencer_ledger_entries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_influencer_ledger_entries_partner" FOREIGN KEY ("partnerId") REFERENCES "influencer_partners"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_influencer_ledger_entries_coupon" FOREIGN KEY ("couponId") REFERENCES "influencer_coupons"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_influencer_ledger_entries_attribution" FOREIGN KEY ("attributionId") REFERENCES "influencer_order_attributions"("id") ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS "IDX_influencer_ledger_entries_partner_status_date" ON "influencer_ledger_entries" ("partnerId", "status", "transactionDate");
      CREATE INDEX IF NOT EXISTS "IDX_influencer_ledger_entries_order" ON "influencer_ledger_entries" ("orderDomain", "orderId", "transactionType");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "influencer_ledger_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "influencer_order_attributions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "influencer_coupon_provider_mappings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "influencer_coupons"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "influencer_social_handles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "influencer_partners"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "influencer_ledger_entries_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "influencer_ledger_entries_transactiontype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "influencer_ledger_entries_orderdomain_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "influencer_order_attributions_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "influencer_order_attributions_provider_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "influencer_order_attributions_ownertype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "influencer_order_attributions_orderdomain_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "influencer_coupon_provider_mappings_provider_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "influencer_coupon_provider_mappings_productdomain_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "influencer_coupons_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "influencer_coupons_ownertype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "influencer_social_handles_platform_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "influencer_partners_paymentmethod_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "influencer_partners_status_enum"`);
  }
}
