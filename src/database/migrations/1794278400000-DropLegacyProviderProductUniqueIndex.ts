import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddAdFreeSubscriptions1794105600000 tried to drop the legacy unique index on
 * store_package_provider_products ("provider", "productId") by matching the
 * text of pg_get_indexdef against '"provider"'. Postgres prints lowercase
 * identifiers unquoted (`provider`), so the match never fired and the legacy
 * index survived. It blocks a second Google Play base plan on the same
 * subscription product (e.g. ad_free/monthly + ad_free/yearly).
 *
 * This migration matches on the index's actual key columns instead of text:
 * any unique index on the table whose key columns are exactly
 * {provider, productId} is dropped. The base-plan-aware identity index
 * (IDX_store_provider_product_base_plan_identity) is left untouched.
 */
export class DropLegacyProviderProductUniqueIndex1794278400000
  implements MigrationInterface
{
  name = 'DropLegacyProviderProductUniqueIndex1794278400000';

  async up(queryRunner: QueryRunner): Promise<void> {
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
            AND i.indisprimary = false
            AND i.indexprs IS NULL
            AND (
              SELECT array_agg(att.attname::text ORDER BY att.attname)
              FROM unnest(i.indkey::smallint[]) AS k(attnum)
              JOIN pg_attribute att
                ON att.attrelid = tbl.oid AND att.attnum = k.attnum
            ) = ARRAY['productId', 'provider']::text[]
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
  }

  async down(): Promise<void> {
    // Intentionally a no-op: restoring the legacy (provider, productId)
    // uniqueness would fail once a product has more than one base plan, and
    // AddAdFreeSubscriptions1794105600000 owns the identity index lifecycle.
  }
}
