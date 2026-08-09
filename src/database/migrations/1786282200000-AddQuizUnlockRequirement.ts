import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuizUnlockRequirement1786282200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "quizzes"
      ADD COLUMN "unlockRequirementEnabled"
      boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "quizzes"
      ADD COLUMN "unlockVideoWatchPercent"
      integer NOT NULL DEFAULT 80
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "quizzes"
      DROP COLUMN "unlockVideoWatchPercent"
    `);

    await queryRunner.query(`
      ALTER TABLE "quizzes"
      DROP COLUMN "unlockRequirementEnabled"
    `);
  }
}
