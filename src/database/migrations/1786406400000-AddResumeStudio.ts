import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResumeStudio1786406400000 implements MigrationInterface {
  name = 'AddResumeStudio1786406400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "resume_studio_templates" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug" varchar(140) NOT NULL,
        "name" varchar(120) NOT NULL,
        "description" varchar(600),
        "category" varchar(80) NOT NULL,
        "isPremium" boolean NOT NULL DEFAULT false,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "status" varchar(30) NOT NULL DEFAULT 'draft',
        "publishedVersionId" uuid,
        "publishedVersionNumber" integer,
        "previewPdfStorageKey" varchar(700),
        "previewImageStorageKey" varchar(700),
        "createdByAdminId" uuid,
        "updatedByAdminId" uuid,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_resume_studio_templates" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_resume_studio_templates_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "resume_studio_template_versions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "templateId" uuid NOT NULL,
        "versionNumber" integer NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'draft',
        "html" text NOT NULL,
        "css" text NOT NULL,
        "fieldSchema" jsonb NOT NULL,
        "rendererConfig" jsonb NOT NULL,
        "checksum" varchar(64) NOT NULL,
        "createdByAdminId" uuid,
        "publishedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_resume_studio_template_versions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_resume_studio_template_version" UNIQUE ("templateId", "versionNumber"),
        CONSTRAINT "FK_resume_studio_template_version_template"
          FOREIGN KEY ("templateId") REFERENCES "resume_studio_templates"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "resume_studio_templates"
      ADD CONSTRAINT "FK_resume_studio_published_version"
      FOREIGN KEY ("publishedVersionId") REFERENCES "resume_studio_template_versions"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "resume_studio_documents" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "title" varchar(160) NOT NULL,
        "templateId" uuid,
        "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "revision" integer NOT NULL DEFAULT 1,
        "status" varchar(30) NOT NULL DEFAULT 'draft',
        "lastAutosavedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_resume_studio_documents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_resume_studio_document_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_resume_studio_document_template"
          FOREIGN KEY ("templateId") REFERENCES "resume_studio_templates"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "resume_studio_generations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "documentId" uuid NOT NULL,
        "templateId" uuid NOT NULL,
        "templateVersionId" uuid NOT NULL,
        "templateVersionNumber" integer NOT NULL,
        "contentHash" varchar(64) NOT NULL,
        "pdfStorageKey" varchar(700) NOT NULL,
        "pageCount" integer NOT NULL,
        "warnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" varchar(30) NOT NULL DEFAULT 'completed',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_resume_studio_generations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_resume_studio_generation_user_hash" UNIQUE ("userId", "contentHash"),
        CONSTRAINT "FK_resume_studio_generation_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_resume_studio_generation_document"
          FOREIGN KEY ("documentId") REFERENCES "resume_studio_documents"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_resume_studio_generation_template"
          FOREIGN KEY ("templateId") REFERENCES "resume_studio_templates"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_resume_studio_generation_template_version"
          FOREIGN KEY ("templateVersionId") REFERENCES "resume_studio_template_versions"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_resume_studio_template_category_status_sort" ON "resume_studio_templates" ("category", "status", "sortOrder")`);
    await queryRunner.query(`CREATE INDEX "IDX_resume_studio_template_version_status" ON "resume_studio_template_versions" ("templateId", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_resume_studio_template_version_checksum" ON "resume_studio_template_versions" ("checksum")`);
    await queryRunner.query(`CREATE INDEX "IDX_resume_studio_document_user_updated" ON "resume_studio_documents" ("userId", "updatedAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_resume_studio_generation_document_created" ON "resume_studio_generations" ("userId", "documentId", "createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "resume_studio_generations"`);
    await queryRunner.query(`DROP TABLE "resume_studio_documents"`);
    await queryRunner.query(`ALTER TABLE "resume_studio_templates" DROP CONSTRAINT "FK_resume_studio_published_version"`);
    await queryRunner.query(`DROP TABLE "resume_studio_template_versions"`);
    await queryRunner.query(`DROP TABLE "resume_studio_templates"`);
  }
}
