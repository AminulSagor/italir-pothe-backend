import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFinalExamUnlockRequirementToggle1786275000000 implements MigrationInterface {
  name = 'AddFinalExamUnlockRequirementToggle1786275000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "exam_templates"
      ADD COLUMN "unlockRequirementEnabled"
      boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "exam_templates"
      DROP COLUMN "unlockRequirementEnabled"
    `);
  }
}
