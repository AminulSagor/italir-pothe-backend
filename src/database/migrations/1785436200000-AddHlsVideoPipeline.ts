import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHlsVideoPipeline1785436200000 implements MigrationInterface {
  name = 'AddHlsVideoPipeline1785436200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "files"
      ALTER COLUMN "sizeBytes"
      TYPE bigint
      USING "sizeBytes"::bigint
    `);

    await queryRunner.query(`
      ALTER TABLE "media_assets"
      ADD COLUMN IF NOT EXISTS "transcodeStatus"
      character varying(30) NOT NULL DEFAULT 'not_required'
    `);

    await queryRunner.query(`
      ALTER TABLE "media_assets"
      ADD COLUMN IF NOT EXISTS "hlsMasterKey"
      character varying(700)
    `);

    await queryRunner.query(`
      ALTER TABLE "media_assets"
      ADD COLUMN IF NOT EXISTS "hlsGenerationId"
      character varying(80)
    `);

    await queryRunner.query(`
      ALTER TABLE "media_assets"
      ADD COLUMN IF NOT EXISTS "sourceWidth" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "media_assets"
      ADD COLUMN IF NOT EXISTS "sourceHeight" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "media_assets"
      ADD COLUMN IF NOT EXISTS "transcodeError" text
    `);

    await queryRunner.query(`
      ALTER TABLE "media_assets"
      ADD COLUMN IF NOT EXISTS "transcodedAt"
      TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "multipart_upload_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "uploadId" character varying(1024) NOT NULL,
        "storageKey" character varying(700) NOT NULL,
        "originalName" character varying(255) NOT NULL,
        "mimeType" character varying(120) NOT NULL,
        "sizeBytes" bigint NOT NULL,
        "filePurpose" character varying(80) NOT NULL,
        "visibility" character varying(30) NOT NULL DEFAULT 'private',
        "ownerUserId" character varying(80),
        "createdByAdminId" character varying(80),
        "partSizeBytes" integer NOT NULL,
        "totalParts" integer NOT NULL,
        "status" character varying(30) NOT NULL DEFAULT 'initiated',
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "abortedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_multipart_upload_sessions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      "UQ_multipart_upload_sessions_upload_id"
      ON "multipart_upload_sessions" ("uploadId")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      "UQ_multipart_upload_sessions_storage_key"
      ON "multipart_upload_sessions" ("storageKey")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
      "IDX_multipart_upload_sessions_status_expires"
      ON "multipart_upload_sessions" ("status", "expiresAt")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "video_transcode_jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "mediaAssetId" uuid NOT NULL,
        "sourceFileId" uuid NOT NULL,
        "status" character varying(30) NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "maxAttempts" integer NOT NULL DEFAULT 3,
        "availableAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "lockedAt" TIMESTAMP WITH TIME ZONE,
        "lockedBy" character varying(160),
        "lastError" text,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_video_transcode_jobs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      "UQ_video_transcode_jobs_media_asset"
      ON "video_transcode_jobs" ("mediaAssetId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
      "IDX_video_transcode_jobs_source_file"
      ON "video_transcode_jobs" ("sourceFileId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
      "IDX_video_transcode_jobs_status_available"
      ON "video_transcode_jobs" ("status", "availableAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "video_transcode_jobs"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "multipart_upload_sessions"
    `);

    await queryRunner.query(`
      ALTER TABLE "media_assets"
      DROP COLUMN IF EXISTS "transcodedAt",
      DROP COLUMN IF EXISTS "transcodeError",
      DROP COLUMN IF EXISTS "sourceHeight",
      DROP COLUMN IF EXISTS "sourceWidth",
      DROP COLUMN IF EXISTS "hlsGenerationId",
      DROP COLUMN IF EXISTS "hlsMasterKey",
      DROP COLUMN IF EXISTS "transcodeStatus"
    `);

    const rows: Array<{ count: string }> = await queryRunner.query(`
      SELECT COUNT(*)::text AS "count"
      FROM "files"
      WHERE "sizeBytes" > 2147483647
    `);

    if (Number(rows[0]?.count ?? 0) > 0) {
      throw new Error(
        'Cannot revert files.sizeBytes because values exceed PostgreSQL integer range.',
      );
    }

    await queryRunner.query(`
      ALTER TABLE "files"
      ALTER COLUMN "sizeBytes"
      TYPE integer
      USING "sizeBytes"::integer
    `);
  }
}
