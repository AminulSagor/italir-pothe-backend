import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGooglePlayCourseRecovery1784117850000 implements MigrationInterface {
  name = 'AddGooglePlayCourseRecovery1784117850000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "course_order_provider_transactions"
      ADD COLUMN "obfuscatedAccountId" character varying(64)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_course_provider_transaction_account_product"
      ON "course_order_provider_transactions"
      (
        "provider",
        "productId",
        "obfuscatedAccountId"
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_course_provider_transaction_account_product"
    `);

    await queryRunner.query(`
      ALTER TABLE "course_order_provider_transactions"
      DROP COLUMN "obfuscatedAccountId"
    `);
  }
}
