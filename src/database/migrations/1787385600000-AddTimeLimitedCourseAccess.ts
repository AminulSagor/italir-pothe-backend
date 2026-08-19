import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimeLimitedCourseAccess1787385600000
  implements MigrationInterface
{
  name = 'AddTimeLimitedCourseAccess1787385600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE enum_name text;
      BEGIN
        SELECT udt_name INTO enum_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'course_enrollments'
          AND column_name = 'accessType';

        IF enum_name IS NOT NULL THEN
          EXECUTE format(
            'ALTER TYPE %I ADD VALUE IF NOT EXISTS %L',
            enum_name,
            'time_limited'
          );
        END IF;

        SELECT udt_name INTO enum_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'course_provider_products'
          AND column_name = 'productType';

        IF enum_name IS NOT NULL THEN
          EXECUTE format(
            'ALTER TYPE %I ADD VALUE IF NOT EXISTS %L',
            enum_name,
            'subscription'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "course_provider_products"
        ADD COLUMN "accessType" varchar(30) NOT NULL DEFAULT 'lifetime',
        ADD COLUMN "durationDays" smallint
    `);

    await queryRunner.query(`
      ALTER TABLE "course_order_provider_snapshots"
        ADD COLUMN "accessType" varchar(30) NOT NULL DEFAULT 'lifetime',
        ADD COLUMN "durationDays" smallint
    `);

    await queryRunner.query(`
      ALTER TABLE "admin_course_access_grants"
        ADD COLUMN "accessType" varchar(30) NOT NULL DEFAULT 'lifetime',
        ADD COLUMN "durationDays" smallint,
        ADD COLUMN "expiresAt" timestamptz
    `);

    await queryRunner.query(`
      ALTER TABLE "course_purchase_orders"
      ADD COLUMN "entitlementExpiresAt" timestamptz
    `);

    await queryRunner.query(`
      UPDATE "course_provider_products"
      SET "basePlanId" = NULL, "offerId" = NULL
      WHERE "accessType" = 'lifetime'
    `);

    await queryRunner.query(`
      DO $$
      DECLARE idx record;
      BEGIN
        FOR idx IN
          SELECT ns.nspname AS schema_name, cls.relname AS index_name
          FROM pg_index i
          JOIN pg_class tbl ON tbl.oid = i.indrelid
          JOIN pg_class cls ON cls.oid = i.indexrelid
          JOIN pg_namespace ns ON ns.oid = cls.relnamespace
          WHERE tbl.relname = 'course_provider_products'
            AND i.indisunique = true
            AND pg_get_indexdef(i.indexrelid) ILIKE '%"provider"%'
            AND pg_get_indexdef(i.indexrelid) ILIKE '%"productId"%'
        LOOP
          EXECUTE format('DROP INDEX IF EXISTS %I.%I', idx.schema_name, idx.index_name);
        END LOOP;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_course_provider_product_identity"
      ON "course_provider_products" (
        "provider",
        "productId",
        COALESCE("basePlanId", '')
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_course_provider_access_duration"
      ON "course_provider_products" (
        "courseId", "provider", "durationDays"
      )
      WHERE "accessType" = 'time_limited' AND "courseId" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "course_provider_products"
      ADD CONSTRAINT "CHK_course_provider_product_access"
      CHECK (
        (
          "accessType" = 'lifetime'
          AND "productType"::text = 'non_consumable'
          AND "durationDays" IS NULL
          AND "basePlanId" IS NULL
        )
        OR
        (
          "accessType" = 'time_limited'
          AND "productType"::text = 'subscription'
          AND "durationDays" BETWEEN 1 AND 3650
          AND (
            ("provider"::text = 'google_play' AND "basePlanId" IS NOT NULL)
            OR
            ("provider"::text = 'app_store' AND "basePlanId" IS NULL)
          )
        )
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "course_order_provider_snapshots"
      ADD CONSTRAINT "CHK_course_order_snapshot_access"
      CHECK (
        ("accessType" = 'lifetime' AND "durationDays" IS NULL)
        OR
        ("accessType" = 'time_limited' AND "durationDays" BETWEEN 1 AND 3650)
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "admin_course_access_grants"
      ADD CONSTRAINT "CHK_admin_course_grant_access"
      CHECK (
        (
          "accessType" = 'lifetime'
          AND "durationDays" IS NULL
          AND "expiresAt" IS NULL
        )
        OR
        (
          "accessType" = 'time_limited'
          AND "durationDays" BETWEEN 1 AND 3650
          AND "expiresAt" IS NOT NULL
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "course_manual_access_options" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "courseId" uuid NOT NULL,
        "accessType" varchar(30) NOT NULL,
        "durationDays" smallint,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_course_manual_access_options" PRIMARY KEY ("id"),
        CONSTRAINT "FK_course_manual_access_options_course"
          FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_course_manual_access_option"
          CHECK (
            ("accessType" = 'lifetime' AND "durationDays" IS NULL)
            OR
            ("accessType" = 'time_limited' AND "durationDays" BETWEEN 1 AND 3650)
          )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_course_manual_access_options_course_active"
      ON "course_manual_access_options" ("courseId", "isActive")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_course_manual_access_lifetime"
      ON "course_manual_access_options" ("courseId")
      WHERE "accessType" = 'lifetime'
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_course_manual_access_duration"
      ON "course_manual_access_options" ("courseId", "durationDays")
      WHERE "accessType" = 'time_limited'
    `);

    await queryRunner.query(`
      INSERT INTO "course_manual_access_options" (
        "courseId", "accessType", "durationDays", "isActive"
      )
      SELECT id, 'lifetime', NULL, true
      FROM "courses"
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "course_enrollments"
          WHERE "accessType"::text = 'time_limited'
        ) OR EXISTS (
          SELECT 1 FROM "course_provider_products"
          WHERE "accessType" = 'time_limited'
        ) OR EXISTS (
          SELECT 1 FROM "admin_course_access_grants"
          WHERE "accessType" = 'time_limited'
        ) THEN
          RAISE EXCEPTION 'Cannot remove time-limited course access while time-limited records exist';
        END IF;
      END $$;
    `);

    await queryRunner.query(`DROP TABLE "course_manual_access_options"`);
    await queryRunner.query(`ALTER TABLE "course_purchase_orders" DROP COLUMN "entitlementExpiresAt"`);
    await queryRunner.query(`ALTER TABLE "admin_course_access_grants" DROP CONSTRAINT "CHK_admin_course_grant_access"`);
    await queryRunner.query(`ALTER TABLE "admin_course_access_grants" DROP COLUMN "expiresAt", DROP COLUMN "durationDays", DROP COLUMN "accessType"`);
    await queryRunner.query(`ALTER TABLE "course_order_provider_snapshots" DROP CONSTRAINT "CHK_course_order_snapshot_access"`);
    await queryRunner.query(`ALTER TABLE "course_order_provider_snapshots" DROP COLUMN "durationDays", DROP COLUMN "accessType"`);
    await queryRunner.query(`ALTER TABLE "course_provider_products" DROP CONSTRAINT "CHK_course_provider_product_access"`);
    await queryRunner.query(`DROP INDEX "UQ_course_provider_product_identity"`);
    await queryRunner.query(`DROP INDEX "UQ_course_provider_access_duration"`);
    await queryRunner.query(`ALTER TABLE "course_provider_products" DROP COLUMN "durationDays", DROP COLUMN "accessType"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_course_provider_products_provider_product"
      ON "course_provider_products" ("provider", "productId")
    `);
  }
}
