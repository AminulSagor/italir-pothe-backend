import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGooglePlayPackageAccountBinding1784289600000 implements MigrationInterface {
  name = 'AddGooglePlayPackageAccountBinding1784289600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "store_order_provider_transactions"
      ADD COLUMN "obfuscatedAccountId" character varying(64)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_store_provider_transaction_account_product"
      ON "store_order_provider_transactions"
      (
        "provider",
        "productId",
        "obfuscatedAccountId"
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_store_provider_transaction_account_product"
    `);

    await queryRunner.query(`
      ALTER TABLE "store_order_provider_transactions"
      DROP COLUMN "obfuscatedAccountId"
    `);
  }
}
