import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteUserReportSubmission1784463600000
  implements MigrationInterface
{
  name = 'CompleteUserReportSubmission1784463600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_reports"
      ADD COLUMN IF NOT EXISTS "clientReportId" varchar(120)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      "IDX_user_reports_reporter_client_report_id"
      ON "user_reports" ("reporterId", "clientReportId")
      WHERE "clientReportId" IS NOT NULL
    `);

    await queryRunner.query(`
      INSERT INTO "report_reasons" (
        "id",
        "title",
        "isActive",
        "createdAt",
        "updatedAt"
      )
      SELECT
        seed.id::uuid,
        seed.title,
        true,
        NOW(),
        NOW()
      FROM (
        VALUES
          ('b8be25b9-3546-4ea5-a2d4-349902f87857', 'Spam or scam'),
          ('09c0b028-3f7d-44b7-8a4c-9e087650e559', 'Harassment or bullying'),
          ('21511d80-bb39-4ce8-8f80-ab401015737e', 'Hate speech'),
          ('c6a4233d-00e9-4386-a6e0-1bf0a8d579e0', 'Sexual content'),
          ('7dba77e4-121e-412f-950f-e06c31d52fcb', 'Violence or threats'),
          ('9c5bd6b2-45ef-4ced-95b1-96de39a6ac93', 'Impersonation'),
          ('daf58f64-b7a6-4204-a7a7-0a18fe63ec81', 'Privacy violation'),
          ('f157f9d7-a801-4dc8-9e73-e46ac380e4ee', 'Other')
      ) AS seed(id, title)
      WHERE NOT EXISTS (
        SELECT 1
        FROM "report_reasons" existing
        WHERE LOWER(TRIM(existing."title")) = LOWER(TRIM(seed.title))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "report_reasons" reason
      WHERE reason."id" IN (
        'b8be25b9-3546-4ea5-a2d4-349902f87857',
        '09c0b028-3f7d-44b7-8a4c-9e087650e559',
        '21511d80-bb39-4ce8-8f80-ab401015737e',
        'c6a4233d-00e9-4386-a6e0-1bf0a8d579e0',
        '7dba77e4-121e-412f-950f-e06c31d52fcb',
        '9c5bd6b2-45ef-4ced-95b1-96de39a6ac93',
        'daf58f64-b7a6-4204-a7a7-0a18fe63ec81',
        'f157f9d7-a801-4dc8-9e73-e46ac380e4ee'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "user_reports" report
        WHERE report."reasonId" = reason."id"
      )
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS
      "IDX_user_reports_reporter_client_report_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "user_reports"
      DROP COLUMN IF EXISTS "clientReportId"
    `);
  }
}
