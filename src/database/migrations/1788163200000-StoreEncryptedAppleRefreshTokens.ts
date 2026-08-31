import { MigrationInterface, QueryRunner } from 'typeorm';

export class StoreEncryptedAppleRefreshTokens1788163200000 implements MigrationInterface {
  name = 'StoreEncryptedAppleRefreshTokens1788163200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_social_accounts"
      ADD COLUMN "appleRefreshTokenCiphertext" text,
      ADD COLUMN "appleRefreshTokenIv" character varying(32),
      ADD COLUMN "appleRefreshTokenAuthTag" character varying(64)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_social_accounts"
      DROP COLUMN "appleRefreshTokenAuthTag",
      DROP COLUMN "appleRefreshTokenIv",
      DROP COLUMN "appleRefreshTokenCiphertext"
    `);
  }
}
