import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowMultipleActiveProviderProducts1783641600000 implements MigrationInterface {
  name = 'AllowMultipleActiveProviderProducts1783641600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * Remove old partial unique indexes like:
     * one active product per package/provider
     * one active product per course/provider
     *
     * We keep provider + productId unique globally.
     */
    await queryRunner.query(`
      DO $$
      DECLARE
        idx RECORD;
      BEGIN
        FOR idx IN
          SELECT
            ns.nspname AS schema_name,
            cls.relname AS index_name
          FROM pg_index i
          JOIN pg_class tbl ON tbl.oid = i.indrelid
          JOIN pg_class cls ON cls.oid = i.indexrelid
          JOIN pg_namespace ns ON ns.oid = cls.relnamespace
          WHERE tbl.relname = 'store_package_provider_products'
          AND i.indisunique = true
          AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%isActive%'
          AND pg_get_indexdef(i.indexrelid) ILIKE '%"packageId"%'
          AND pg_get_indexdef(i.indexrelid) ILIKE '%"provider"%'
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
      DO $$
      DECLARE
        idx RECORD;
      BEGIN
        FOR idx IN
          SELECT
            ns.nspname AS schema_name,
            cls.relname AS index_name
          FROM pg_index i
          JOIN pg_class tbl ON tbl.oid = i.indrelid
          JOIN pg_class cls ON cls.oid = i.indexrelid
          JOIN pg_namespace ns ON ns.oid = cls.relnamespace
          WHERE tbl.relname = 'course_provider_products'
          AND i.indisunique = true
          AND pg_get_expr(i.indpred, i.indrelid) ILIKE '%isActive%'
          AND pg_get_indexdef(i.indexrelid) ILIKE '%"courseId"%'
          AND pg_get_indexdef(i.indexrelid) ILIKE '%"provider"%'
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
      CREATE INDEX IF NOT EXISTS "IDX_store_package_provider_products_package_provider_active"
      ON "store_package_provider_products" ("packageId", "provider", "isActive")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_course_provider_products_course_provider_active"
      ON "course_provider_products" ("courseId", "provider", "isActive")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_store_package_provider_products_package_provider_active"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_course_provider_products_course_provider_active"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_store_package_provider_products_one_active_provider"
      ON "store_package_provider_products" ("packageId", "provider")
      WHERE "isActive" = true
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_course_provider_products_one_active_provider"
      ON "course_provider_products" ("courseId", "provider")
      WHERE "isActive" = true
    `);
  }
}
