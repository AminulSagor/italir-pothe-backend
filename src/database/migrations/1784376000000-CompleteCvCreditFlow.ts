import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteCvCreditFlow1784376000000 implements MigrationInterface {
  name = 'CompleteCvCreditFlow1784376000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_store_wallets"
      ADD COLUMN "freeCvGenerationsRemaining" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "user_store_wallets"
      ADD COLUMN "freeCvGenerationsGrantedAt" timestamptz
    `);

    await queryRunner.query(`
      ALTER TABLE "cv_generations"
      ADD COLUMN "creditChargeSource" varchar(30) NOT NULL DEFAULT 'none'
    `);

    await queryRunner.query(`
      ALTER TABLE "cv_generations"
      ADD COLUMN "creditChargedAt" timestamptz
    `);

    await queryRunner.query(`
      ALTER TABLE "cv_generations"
      ADD COLUMN "creditRefundedAt" timestamptz
    `);

    await queryRunner.query(`
      ALTER TABLE "cv_economy_configs"
      ALTER COLUMN "freeCreditsPerSignup"
      SET DEFAULT 3
    `);

    await queryRunner.query(`
      UPDATE "cv_economy_configs"
      SET "freeCreditsPerSignup" = 3
      WHERE "configKey" = 'default'
    `);

    /*
     * The old implementation granted two free credits directly into
     * cvCredits. Remove that legacy free portion so purchased credits
     * remain separate from the new free-generation allowance.
     *
     * Change the number 2 here only if your old production setting
     * was different from the current uploaded default.
     */
    await queryRunner.query(`
      UPDATE "user_store_wallets"
      SET "cvCredits" = GREATEST("cvCredits" - 2, 0)
      WHERE "signupCvCreditsGrantedAt" IS NOT NULL
    `);

    /*
     * Existing users who already generated three or more new CVs
     * start with no remaining free generations.
     *
     * Failed generations are not counted.
     * Edits/regenerations are not counted because sourceGenerationId
     * is not null.
     */
    await queryRunner.query(`
      UPDATE "user_store_wallets" wallet
      SET
        "freeCvGenerationsRemaining" = GREATEST(
          3 - COALESCE(
            (
              SELECT COUNT(*)::integer
              FROM "cv_generations" generation
              WHERE generation."userId" = wallet."userId"
                AND generation."sourceGenerationId" IS NULL
                AND generation."status" IN ('processing', 'completed')
            ),
            0
          ),
          0
        ),
        "freeCvGenerationsGrantedAt" = COALESCE(
          wallet."signupCvCreditsGrantedAt",
          wallet."createdAt",
          NOW()
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cv_economy_configs"
      ALTER COLUMN "freeCreditsPerSignup"
      SET DEFAULT 2
    `);

    await queryRunner.query(`
      ALTER TABLE "cv_generations"
      DROP COLUMN "creditRefundedAt"
    `);

    await queryRunner.query(`
      ALTER TABLE "cv_generations"
      DROP COLUMN "creditChargedAt"
    `);

    await queryRunner.query(`
      ALTER TABLE "cv_generations"
      DROP COLUMN "creditChargeSource"
    `);

    await queryRunner.query(`
      ALTER TABLE "user_store_wallets"
      DROP COLUMN "freeCvGenerationsGrantedAt"
    `);

    await queryRunner.query(`
      ALTER TABLE "user_store_wallets"
      DROP COLUMN "freeCvGenerationsRemaining"
    `);
  }
}
