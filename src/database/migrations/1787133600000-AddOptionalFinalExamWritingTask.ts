import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOptionalFinalExamWritingTask1787133600000
  implements MigrationInterface
{
  name = 'AddOptionalFinalExamWritingTask1787133600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "exam_templates"
      ADD COLUMN "writingTaskEnabled"
      boolean NOT NULL DEFAULT true
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "exam_templates"
      DROP COLUMN "writingTaskEnabled"
    `);
  }
}
