import { MigrationInterface, QueryRunner } from 'typeorm';

export class UsePlayCompatibleCourseCouponBasePlanPrefix1787731200000 implements MigrationInterface {
  name = 'UsePlayCompatibleCourseCouponBasePlanPrefix1787731200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_course_provider_access_duration_kind"
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
          OR lower(COALESCE("basePlanId", '')) LIKE 'coupon-%'
        )
      )
      WHERE "accessType" = 'time_limited' AND "courseId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const playCompatibleMappings = await queryRunner.query(`
      SELECT COUNT(*)::int AS count
      FROM "course_provider_products"
      WHERE "accessType" = 'time_limited'
        AND lower(COALESCE("basePlanId", '')) LIKE 'coupon-%'
    `);
    if (Number(playCompatibleMappings[0]?.count ?? 0) > 0) {
      throw new Error(
        'Cannot restore the legacy coupon base-plan prefix while coupon- mappings exist.',
      );
    }

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_course_provider_access_duration_kind"
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
}
