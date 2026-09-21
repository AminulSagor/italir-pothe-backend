import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResumeTemplatePreviewSampleData1786444800000
  implements MigrationInterface
{
  name = 'AddResumeTemplatePreviewSampleData1786444800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "resume_studio_template_versions"
      ADD COLUMN "sampleData" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "resume_studio_template_versions"
      DROP COLUMN "sampleData"
    `);
  }
}
