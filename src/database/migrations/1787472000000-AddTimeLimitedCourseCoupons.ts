import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimeLimitedCourseCoupons1787472000000
  implements MigrationInterface
{
  name = 'AddTimeLimitedCourseCoupons1787472000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "courses"
      ADD COLUMN "timeLimitedCouponCode" varchar(80)
    `);

    await queryRunner.query(`
      ALTER TABLE "influencer_coupon_provider_mappings"
      ADD COLUMN "accessType" varchar(30) NOT NULL DEFAULT 'lifetime',
      ADD COLUMN "durationDays" smallint,
      ADD COLUMN "regularProviderBasePlanId" varchar(255)
    `);

    await queryRunner.query(`
      ALTER TABLE "influencer_coupon_provider_mappings"
      DROP CONSTRAINT IF EXISTS "CHK_influencer_coupon_mapping_products_different"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_influencer_coupon_mapping_course"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_influencer_coupon_mapping_course_scope"
      ON "influencer_coupon_provider_mappings" (
        "couponId",
        "productDomain",
        "courseId",
        "provider",
        "accessType",
        COALESCE("durationDays", 0)
      )
      WHERE "courseId" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "influencer_coupon_provider_mappings"
      ADD CONSTRAINT "CHK_influencer_coupon_mapping_access"
      CHECK (
        (
          "productDomain"::text = 'store_package'
          AND "accessType" = 'lifetime'
          AND "durationDays" IS NULL
          AND "regularProviderBasePlanId" IS NULL
          AND "regularProviderProductId" <> "discountedProviderProductId"
        )
        OR
        (
          "productDomain"::text = 'course'
          AND "accessType" = 'lifetime'
          AND "durationDays" IS NULL
          AND "regularProviderBasePlanId" IS NULL
          AND "regularProviderProductId" <> "discountedProviderProductId"
        )
        OR
        (
          "productDomain"::text = 'course'
          AND "accessType" = 'time_limited'
          AND "durationDays" BETWEEN 1 AND 3650
          AND (
            (
              "provider"::text = 'google_play'
              AND "regularProviderProductId" = "discountedProviderProductId"
              AND "regularProviderBasePlanId" IS NOT NULL
              AND "providerBasePlanId" IS NOT NULL
              AND "regularProviderBasePlanId" <> "providerBasePlanId"
            )
            OR
            (
              "provider"::text = 'app_store'
              AND "regularProviderProductId" <> "discountedProviderProductId"
              AND "regularProviderBasePlanId" IS NULL
              AND "providerBasePlanId" IS NULL
            )
          )
        )
      )
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_course_provider_access_duration"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_course_provider_access_duration_kind"
      ON "course_provider_products" (
        "courseId",
        "provider",
        "durationDays",
        (
          lower("productId") LIKE 'coupon\\_%' ESCAPE '\\'
          OR lower(COALESCE("basePlanId", '')) LIKE 'coupon\\_%' ESCAPE '\\'
        )
      )
      WHERE "accessType" = 'time_limited' AND "courseId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const timedCouponMappings = await queryRunner.query(`
      SELECT COUNT(*)::int AS count
      FROM "influencer_coupon_provider_mappings"
      WHERE "accessType" = 'time_limited'
    `);
    if (Number(timedCouponMappings[0]?.count ?? 0) > 0) {
      throw new Error(
        'Cannot remove time-limited course coupon support while mappings exist.',
      );
    }

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_course_provider_access_duration_kind"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_course_provider_access_duration"
      ON "course_provider_products" ("courseId", "provider", "durationDays")
      WHERE "accessType" = 'time_limited' AND "courseId" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "influencer_coupon_provider_mappings"
      DROP CONSTRAINT IF EXISTS "CHK_influencer_coupon_mapping_access"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_influencer_coupon_mapping_course_scope"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_influencer_coupon_mapping_course"
      ON "influencer_coupon_provider_mappings" (
        "couponId", "productDomain", "courseId", "provider"
      )
      WHERE "courseId" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "influencer_coupon_provider_mappings"
      ADD CONSTRAINT "CHK_influencer_coupon_mapping_products_different"
      CHECK ("regularProviderProductId" <> "discountedProviderProductId")
    `);
    await queryRunner.query(`
      ALTER TABLE "influencer_coupon_provider_mappings"
      DROP COLUMN "regularProviderBasePlanId",
      DROP COLUMN "durationDays",
      DROP COLUMN "accessType"
    `);
    await queryRunner.query(`
      ALTER TABLE "courses" DROP COLUMN "timeLimitedCouponCode"
    `);
  }
}
