import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ProtectQuizSessionResumeProgress1788076800000
  implements MigrationInterface
{
  name = 'ProtectQuizSessionResumeProgress1788076800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /*
     * Older application versions could race while starting the same quiz and
     * create more than one in-progress session. Keep the session containing
     * the most confirmed answers, move every non-conflicting confirmed answer
     * to it, and cancel the other sessions. No answer record is deleted.
     */
    await queryRunner.query(`
      WITH ranked_sessions AS (
        SELECT
          session."id",
          FIRST_VALUE(session."id") OVER (
            PARTITION BY session."userId", session."quizId", session."lessonId"
            ORDER BY COUNT(DISTINCT answer."questionId") DESC,
                     session."updatedAt" DESC,
                     session."createdAt" DESC,
                     session."id" ASC
          ) AS "canonicalSessionId",
          ROW_NUMBER() OVER (
            PARTITION BY session."userId", session."quizId", session."lessonId"
            ORDER BY COUNT(DISTINCT answer."questionId") DESC,
                     session."updatedAt" DESC,
                     session."createdAt" DESC,
                     session."id" ASC
          ) AS "sessionRank"
        FROM "quiz_sessions" AS session
        LEFT JOIN "quiz_attempt_answers" AS answer
          ON answer."sessionId" = session."id"
        WHERE session."status" = 'in_progress'
        GROUP BY session."id"
      ), ranked_answers AS (
        SELECT
          answer."id" AS "answerId",
          answer."sessionId",
          ranked."canonicalSessionId",
          ROW_NUMBER() OVER (
            PARTITION BY ranked."canonicalSessionId", answer."questionId"
            ORDER BY
              CASE
                WHEN answer."sessionId" = ranked."canonicalSessionId" THEN 0
                ELSE 1
              END,
              answer."createdAt" ASC,
              answer."id" ASC
          ) AS "answerRank"
        FROM "quiz_attempt_answers" AS answer
        INNER JOIN ranked_sessions AS ranked
          ON ranked."id" = answer."sessionId"
      )
      UPDATE "quiz_attempt_answers" AS answer
      SET "sessionId" = ranked."canonicalSessionId",
          "updatedAt" = NOW()
      FROM ranked_answers AS ranked
      WHERE answer."id" = ranked."answerId"
        AND ranked."sessionId" <> ranked."canonicalSessionId"
        AND ranked."answerRank" = 1
    `);

    await queryRunner.query(`
      WITH ranked_sessions AS (
        SELECT
          session."id",
          ROW_NUMBER() OVER (
            PARTITION BY session."userId", session."quizId", session."lessonId"
            ORDER BY COUNT(DISTINCT answer."questionId") DESC,
                     session."updatedAt" DESC,
                     session."createdAt" DESC,
                     session."id" ASC
          ) AS "sessionRank"
        FROM "quiz_sessions" AS session
        LEFT JOIN "quiz_attempt_answers" AS answer
          ON answer."sessionId" = session."id"
        WHERE session."status" = 'in_progress'
        GROUP BY session."id"
      )
      UPDATE "quiz_sessions" AS session
      SET "status" = 'cancelled',
          "updatedAt" = NOW()
      FROM ranked_sessions AS ranked
      WHERE session."id" = ranked."id"
        AND ranked."sessionRank" > 1
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_quiz_sessions_active_user_quiz_lesson"
      ON "quiz_sessions" ("userId", "quizId", "lessonId")
      WHERE "status" = 'in_progress'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_quiz_sessions_active_user_quiz_lesson"
    `);
  }
}
