import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResumeStudioCreationCharging1786531200000
  implements MigrationInterface
{
  name = 'AddResumeStudioCreationCharging1786531200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "resume_studio_documents"
      ADD COLUMN "creationChargedAt" timestamptz,
      ADD COLUMN "creationChargeSource" varchar(30)
    `);

    /*
     * Existing generated CVs must remain free to edit after deployment.
     * We cannot reliably recover their historical charge source, so mark them
     * as legacy-paid documents instead of charging them again.
     */
    await queryRunner.query(`
      UPDATE "resume_studio_documents" AS document
      SET
        "creationChargedAt" = COALESCE(
          (
            SELECT MIN(generation."createdAt")
            FROM "resume_studio_generations" AS generation
            WHERE generation."documentId" = document."id"
          ),
          document."updatedAt"
        ),
        "creationChargeSource" = 'legacy'
      WHERE EXISTS (
        SELECT 1
        FROM "resume_studio_generations" AS generation
        WHERE generation."documentId" = document."id"
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_resume_studio_document_user_charge_source"
      ON "resume_studio_documents" ("userId", "creationChargeSource")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_resume_studio_document_user_charge_source"
    `);

    await queryRunner.query(`
      ALTER TABLE "resume_studio_documents"
      DROP COLUMN "creationChargeSource",
      DROP COLUMN "creationChargedAt"
    `);
  }
}
