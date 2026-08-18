import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MaintainUniqueQuizQuestionSortOrder1787047200000 implements MigrationInterface {
  name = 'MaintainUniqueQuizQuestionSortOrder1787047200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ordered_questions AS (
        SELECT
          "id",
          ROW_NUMBER() OVER (
            PARTITION BY "quizId"
            ORDER BY "sortOrder" ASC, "createdAt" ASC, "id" ASC
          )::integer AS "nextSortOrder"
        FROM "quiz_questions"
      )
      UPDATE "quiz_questions" AS question
      SET "sortOrder" = ordered."nextSortOrder"
      FROM ordered_questions AS ordered
      WHERE question."id" = ordered."id"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_quiz_questions_quiz_sort_order"
      ON "quiz_questions" ("quizId", "sortOrder")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_quiz_questions_quiz_sort_order"
    `);
  }
}
