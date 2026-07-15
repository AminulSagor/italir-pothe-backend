import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowFinalExamRetakes1784160000000 implements MigrationInterface {
  name = 'AllowFinalExamRetakes1784160000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "exam_attempts"
      DROP CONSTRAINT IF EXISTS
      "UQ_exam_attempt_user_exam"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS
      "UQ_exam_attempt_user_exam"
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
      "IDX_exam_attempt_user_exam_created"
      ON "exam_attempts" (
        "userId",
        "examTemplateId",
        "createdAt"
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      "UQ_exam_attempt_active_user_exam"
      ON "exam_attempts" (
        "userId",
        "examTemplateId"
      )
      WHERE "status" IN (
        'in_progress',
        'submitted',
        'under_review'
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS
      "UQ_exam_attempt_active_user_exam"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS
      "IDX_exam_attempt_user_exam_created"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      "UQ_exam_attempt_user_exam"
      ON "exam_attempts" (
        "userId",
        "examTemplateId"
      )
    `);
  }
}
