import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OneResumeWorkspacePerTemplate1786617600000
  implements MigrationInterface
{
  name = 'OneResumeWorkspacePerTemplate1786617600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "resume_studio_generations"
      ADD COLUMN "documentRevision" integer
    `);

    /*
     * Build a temporary merge map for every non-archived user/template group.
     * The most recently edited document is the workspace we keep.
     */
    await queryRunner.query(`
      CREATE TEMP TABLE "_resume_workspace_merge" ON COMMIT DROP AS
      SELECT
        "id" AS "sourceDocumentId",
        FIRST_VALUE("id") OVER (
          PARTITION BY "userId", "templateId"
          ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
        ) AS "keeperDocumentId"
      FROM "resume_studio_documents"
      WHERE "templateId" IS NOT NULL
        AND "status" <> 'archived'
    `);

    /*
     * If any duplicate already paid for its first PDF, carry that paid state
     * onto the keeper. Consolidating drafts must never charge the user again.
     */
    await queryRunner.query(`
      WITH merged_charge AS (
        SELECT
          merge."keeperDocumentId",
          MIN(document."creationChargedAt") AS "creationChargedAt",
          (
            ARRAY_AGG(
              document."creationChargeSource"
              ORDER BY document."creationChargedAt" ASC NULLS LAST
            ) FILTER (WHERE document."creationChargeSource" IS NOT NULL)
          )[1] AS "creationChargeSource"
        FROM "_resume_workspace_merge" AS merge
        INNER JOIN "resume_studio_documents" AS document
          ON document."id" = merge."sourceDocumentId"
        GROUP BY merge."keeperDocumentId"
      )
      UPDATE "resume_studio_documents" AS keeper
      SET
        "creationChargedAt" = COALESCE(
          keeper."creationChargedAt",
          merged."creationChargedAt"
        ),
        "creationChargeSource" = COALESCE(
          keeper."creationChargeSource",
          merged."creationChargeSource"
        )
      FROM merged_charge AS merged
      WHERE keeper."id" = merged."keeperDocumentId"
        AND merged."creationChargedAt" IS NOT NULL
    `);

    /*
     * Across duplicate workspaces keep only the newest generated PDF metadata.
     * Its existing storage key remains valid; the next regeneration moves the
     * workspace onto the normal latest.pdf key for the keeper document.
     */
    await queryRunner.query(`
      WITH ranked_generations AS (
        SELECT
          generation."id",
          merge."keeperDocumentId",
          ROW_NUMBER() OVER (
            PARTITION BY merge."keeperDocumentId"
            ORDER BY generation."createdAt" DESC, generation."id" DESC
          ) AS row_number
        FROM "resume_studio_generations" AS generation
        INNER JOIN "_resume_workspace_merge" AS merge
          ON merge."sourceDocumentId" = generation."documentId"
      )
      DELETE FROM "resume_studio_generations" AS generation
      USING ranked_generations AS ranked
      WHERE generation."id" = ranked."id"
        AND ranked.row_number > 1
    `);

    await queryRunner.query(`
      UPDATE "resume_studio_generations" AS generation
      SET "documentId" = merge."keeperDocumentId"
      FROM "_resume_workspace_merge" AS merge
      WHERE generation."documentId" = merge."sourceDocumentId"
        AND merge."sourceDocumentId" <> merge."keeperDocumentId"
    `);

    await queryRunner.query(`
      UPDATE "resume_studio_documents" AS document
      SET "status" = 'archived'
      FROM "_resume_workspace_merge" AS merge
      WHERE document."id" = merge."sourceDocumentId"
        AND merge."sourceDocumentId" <> merge."keeperDocumentId"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_resume_studio_active_document_per_template"
      ON "resume_studio_documents" ("userId", "templateId")
      WHERE "templateId" IS NOT NULL AND "status" <> 'archived'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_resume_studio_active_document_per_template"
    `);

    await queryRunner.query(`
      ALTER TABLE "resume_studio_generations"
      DROP COLUMN "documentRevision"
    `);
  }
}
