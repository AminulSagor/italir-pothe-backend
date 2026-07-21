import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiContentReports1784682000000
  implements MigrationInterface
{
  name = 'CreateAiContentReports1784682000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_content_reports" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "reporterId" uuid NOT NULL,
        "featureType" character varying(30) NOT NULL,
        "issue" character varying(60) NOT NULL,
        "details" text,
        "sourceReference" character varying(160),
        "messageReference" character varying(160),
        "aiContentText" text,
        "aiContentFileId" uuid,
        "aiContentUrl" text,
        "screenshotFileId" uuid,
        "clientReportId" character varying(120),
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "adminNote" text,
        "reviewedByAdminId" uuid,
        "reviewedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_content_reports" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_content_reports_status_created_at"
      ON "ai_content_reports" ("status", "createdAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_content_reports_feature_created_at"
      ON "ai_content_reports" ("featureType", "createdAt")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_content_reports_reporter_client_report_id"
      ON "ai_content_reports" ("reporterId", "clientReportId")
      WHERE "clientReportId" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "ai_content_reports"
      ADD CONSTRAINT "CHK_ai_content_reports_feature_type"
      CHECK ("featureType" IN ('writing', 'talking', 'cv_builder'))
    `);

    await queryRunner.query(`
      ALTER TABLE "ai_content_reports"
      ADD CONSTRAINT "CHK_ai_content_reports_issue"
      CHECK (
        "issue" IN (
          'offensive_or_hateful',
          'sexual_or_inappropriate',
          'dangerous_or_harmful',
          'harassment',
          'false_or_misleading',
          'privacy_concern',
          'other'
        )
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "ai_content_reports"
      ADD CONSTRAINT "CHK_ai_content_reports_status"
      CHECK ("status" IN ('pending', 'reviewed', 'resolved', 'dismissed'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_content_reports"`);
  }
}
