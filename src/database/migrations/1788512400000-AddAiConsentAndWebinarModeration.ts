import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiConsentAndWebinarModeration1788512400000 implements MigrationInterface {
  name = 'AddAiConsentAndWebinarModeration1788512400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_ai_consents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "version" character varying(40) NOT NULL,
        "providers" jsonb NOT NULL,
        "dataCategories" jsonb NOT NULL,
        "grantedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revokedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_ai_consents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_ai_consents_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_user_ai_consents_user" ON "user_ai_consents" ("userId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_user_ai_consents_user"`);
    await queryRunner.query(`DROP TABLE "user_ai_consents"`);
  }
}
