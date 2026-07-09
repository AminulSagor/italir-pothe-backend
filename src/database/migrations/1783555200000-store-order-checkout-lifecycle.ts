import { MigrationInterface, QueryRunner } from 'typeorm';

export class StoreOrderCheckoutLifecycle1783555200000 implements MigrationInterface {
  name = 'StoreOrderCheckoutLifecycle1783555200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "store_orders_status_enum"
      ADD VALUE IF NOT EXISTS 'cancelled'
    `);

    await queryRunner.query(`
      ALTER TYPE "store_orders_status_enum"
      ADD VALUE IF NOT EXISTS 'expired'
    `);

    await queryRunner.query(`
      ALTER TYPE "store_order_timeline_events_eventtype_enum"
      ADD VALUE IF NOT EXISTS 'order_cancelled'
    `);

    await queryRunner.query(`
      ALTER TYPE "store_order_timeline_events_eventtype_enum"
      ADD VALUE IF NOT EXISTS 'order_expired'
    `);

    await queryRunner.query(`
      ALTER TABLE "store_orders"
      ADD COLUMN IF NOT EXISTS "checkoutExpiresAt" timestamptz
    `);

    await queryRunner.query(`
      ALTER TABLE "store_orders"
      ADD COLUMN IF NOT EXISTS "cancelledAt" timestamptz
    `);

    await queryRunner.query(`
      ALTER TABLE "store_orders"
      ADD COLUMN IF NOT EXISTS "expiredAt" timestamptz
    `);

    await queryRunner.query(`
      UPDATE "store_orders"
      SET "checkoutExpiresAt" = "createdAt" + INTERVAL '15 minutes'
      WHERE "checkoutExpiresAt" IS NULL
      AND "status" = 'pending'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_store_orders_pending_checkout_expiry"
      ON "store_orders" ("status", "checkoutExpiresAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_store_orders_pending_checkout_expiry"
    `);

    await queryRunner.query(`
      ALTER TABLE "store_orders"
      DROP COLUMN IF EXISTS "expiredAt"
    `);

    await queryRunner.query(`
      ALTER TABLE "store_orders"
      DROP COLUMN IF EXISTS "cancelledAt"
    `);

    await queryRunner.query(`
      ALTER TABLE "store_orders"
      DROP COLUMN IF EXISTS "checkoutExpiresAt"
    `);

    /*
     * PostgreSQL enum values cannot be safely removed without recreating
     * the enum type. Keep enum values on rollback.
     */
  }
}
