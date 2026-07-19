import { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkUserReportsToModeration1784460000000 implements MigrationInterface {
  name = 'LinkUserReportsToModeration1784460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "moderation_reports"
      ADD COLUMN IF NOT EXISTS
      "sourceUserReportId" uuid
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      "UQ_moderation_reports_source_user_report_id"
      ON "moderation_reports" (
        "sourceUserReportId"
      )
      WHERE "sourceUserReportId" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "report_visual_evidence"
      ADD COLUMN IF NOT EXISTS
      "evidenceFileId" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "report_visual_evidence"
      ALTER COLUMN "mediaUrl"
      DROP NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
      "IDX_report_visual_evidence_file_id"
      ON "report_visual_evidence" (
        "evidenceFileId"
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname =
            'FK_moderation_reports_source_user_report'
        ) THEN
          ALTER TABLE "moderation_reports"
          ADD CONSTRAINT
          "FK_moderation_reports_source_user_report"
          FOREIGN KEY ("sourceUserReportId")
          REFERENCES "user_reports"("id")
          ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname =
            'FK_report_visual_evidence_file'
        ) THEN
          ALTER TABLE "report_visual_evidence"
          ADD CONSTRAINT
          "FK_report_visual_evidence_file"
          FOREIGN KEY ("evidenceFileId")
          REFERENCES "files"("id")
          ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "report_visual_evidence"
      DROP CONSTRAINT IF EXISTS
      "FK_report_visual_evidence_file"
    `);

    await queryRunner.query(`
      ALTER TABLE "moderation_reports"
      DROP CONSTRAINT IF EXISTS
      "FK_moderation_reports_source_user_report"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS
      "IDX_report_visual_evidence_file_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS
      "UQ_moderation_reports_source_user_report_id"
    `);

    await queryRunner.query(`
      UPDATE "report_visual_evidence"
      SET "mediaUrl" = ''
      WHERE "mediaUrl" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "report_visual_evidence"
      ALTER COLUMN "mediaUrl"
      SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "report_visual_evidence"
      DROP COLUMN IF EXISTS "evidenceFileId"
    `);

    await queryRunner.query(`
      ALTER TABLE "moderation_reports"
      DROP COLUMN IF EXISTS "sourceUserReportId"
    `);
  }
}
