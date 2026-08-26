import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppStoreCouponOfferType1787990400000 implements MigrationInterface {
  name = 'AddAppStoreCouponOfferType1787990400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "influencer_coupon_provider_mappings" ADD "appStoreOfferType" varchar(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_order_provider_snapshots" ADD "offerType" varchar(32)`,
    );
    await queryRunner.query(`
      UPDATE "influencer_coupon_provider_mappings"
      SET "appStoreOfferType" = 'promotional_offer'
      WHERE "provider" = 'app_store' AND "providerOfferId" IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE "store_order_provider_snapshots"
      SET "offerType" = 'promotional_offer'
      WHERE "provider" = 'app_store' AND "offerId" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "influencer_coupon_provider_mappings"
      ADD CONSTRAINT "CHK_influencer_coupon_app_store_offer_type"
      CHECK ("appStoreOfferType" IS NULL OR "appStoreOfferType" IN ('promotional_offer', 'offer_code'))
    `);
    await queryRunner.query(`
      ALTER TABLE "store_order_provider_snapshots"
      ADD CONSTRAINT "CHK_store_order_app_store_offer_type"
      CHECK ("offerType" IS NULL OR "offerType" IN ('promotional_offer', 'offer_code'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "store_order_provider_snapshots" DROP CONSTRAINT "CHK_store_order_app_store_offer_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "influencer_coupon_provider_mappings" DROP CONSTRAINT "CHK_influencer_coupon_app_store_offer_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "store_order_provider_snapshots" DROP COLUMN "offerType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "influencer_coupon_provider_mappings" DROP COLUMN "appStoreOfferType"`,
    );
  }
}
