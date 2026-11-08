import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdFreeSubscriptions1794105600000 implements MigrationInterface {
  name = 'AddAdFreeSubscriptions1794105600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE enum_name text;
      BEGIN
        FOR enum_name IN
          SELECT t.typname
          FROM pg_type t
          JOIN pg_enum e ON e.enumtypid = t.oid
          GROUP BY t.typname
          HAVING bool_or(e.enumlabel = 'one_time')
             AND bool_or(e.enumlabel = 'monthly')
        LOOP
          EXECUTE format(
            'ALTER TYPE %I ADD VALUE IF NOT EXISTS ''yearly''',
            enum_name
          );
        END LOOP;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "store_packages"
      ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz NULL
    `);

    await queryRunner.query(`
      DO $$
      DECLARE idx RECORD;
      BEGIN
        FOR idx IN
          SELECT ns.nspname AS schema_name, cls.relname AS index_name
          FROM pg_index i
          JOIN pg_class tbl ON tbl.oid = i.indrelid
          JOIN pg_class cls ON cls.oid = i.indexrelid
          JOIN pg_namespace ns ON ns.oid = cls.relnamespace
          WHERE tbl.relname = 'store_package_provider_products'
            AND i.indisunique = true
            AND pg_get_indexdef(i.indexrelid) ILIKE '%"provider"%'
            AND pg_get_indexdef(i.indexrelid) ILIKE '%"productId"%'
            AND pg_get_indexdef(i.indexrelid) NOT ILIKE '%"basePlanId"%'
        LOOP
          EXECUTE format(
            'DROP INDEX IF EXISTS %I.%I',
            idx.schema_name,
            idx.index_name
          );
        END LOOP;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      "IDX_store_provider_product_base_plan_identity"
      ON "store_package_provider_products"
      ("provider", "productId", COALESCE("basePlanId", ''))
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_store_packages_deletedAt"
      ON "store_packages" ("deletedAt")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "store_packages" SET "deletedAt" = NULL
      WHERE "deletedAt" IS NOT NULL
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_store_packages_deletedAt"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_store_provider_product_base_plan_identity"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      "IDX_store_package_provider_products_provider_product"
      ON "store_package_provider_products" ("provider", "productId")
    `);
    await queryRunner.query(`
      ALTER TABLE "store_packages" DROP COLUMN IF EXISTS "deletedAt"
    `);
  }
}
