import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordResetVerificationFields1784624400000 implements MigrationInterface {
  name = 'AddPasswordResetVerificationFields1784624400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "otps"
      ADD COLUMN IF NOT EXISTS
      "resetTokenHash" varchar(64)
    `);

    await queryRunner.query(`
      ALTER TABLE "otps"
      ADD COLUMN IF NOT EXISTS
      "resetTokenExpiresAt" timestamptz
    `);

    await queryRunner.query(`
      ALTER TABLE "otps"
      ADD COLUMN IF NOT EXISTS
      "verifiedAt" timestamptz
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      "UQ_otps_reset_token_hash"
      ON "otps" ("resetTokenHash")
      WHERE "resetTokenHash" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS
      "UQ_otps_reset_token_hash"
    `);

    await queryRunner.query(`
      ALTER TABLE "otps"
      DROP COLUMN IF EXISTS "verifiedAt"
    `);

    await queryRunner.query(`
      ALTER TABLE "otps"
      DROP COLUMN IF EXISTS
      "resetTokenExpiresAt"
    `);

    await queryRunner.query(`
      ALTER TABLE "otps"
      DROP COLUMN IF EXISTS "resetTokenHash"
    `);
  }
}
