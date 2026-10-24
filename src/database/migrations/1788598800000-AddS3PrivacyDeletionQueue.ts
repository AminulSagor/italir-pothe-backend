import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddS3PrivacyDeletionQueue1788598800000
  implements MigrationInterface
{
  name = 'AddS3PrivacyDeletionQueue1788598800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "pending_single_uploads" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "storageKey" character varying(700) NOT NULL,
        "ownerUserId" character varying(80) NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pending_single_uploads" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_pending_single_uploads_storage_key" UNIQUE ("storageKey")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_pending_single_uploads_owner"
      ON "pending_single_uploads" ("ownerUserId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_pending_single_uploads_expiry"
      ON "pending_single_uploads" ("expiresAt")
    `);
    await queryRunner.query(`
      CREATE TABLE "s3_deletion_jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "batchId" uuid NOT NULL,
        "operation" character varying(20) NOT NULL,
        "storageKey" character varying(700) NOT NULL,
        "uploadId" character varying(1024),
        "attempts" integer NOT NULL DEFAULT 0,
        "nextAttemptAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "lockedAt" TIMESTAMP WITH TIME ZONE,
        "lastError" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_s3_deletion_jobs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_s3_deletion_jobs_due"
      ON "s3_deletion_jobs" ("nextAttemptAt", "lockedAt")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_s3_deletion_jobs_batch"
      ON "s3_deletion_jobs" ("batchId")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_s3_deletion_jobs_target"
      ON "s3_deletion_jobs" (
        "operation",
        "storageKey",
        COALESCE("uploadId", '')
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "s3_deletion_jobs"`);
    await queryRunner.query(`DROP TABLE "pending_single_uploads"`);
  }
}
