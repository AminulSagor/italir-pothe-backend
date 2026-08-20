import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSocialAuthentication1787558400000 implements MigrationInterface {
  name = 'AddSocialAuthentication1787558400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_social_accounts_provider_enum" AS ENUM('google', 'facebook')`,
    );
    await queryRunner.query(`
      CREATE TABLE "user_social_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "provider" "public"."user_social_accounts_provider_enum" NOT NULL,
        "providerUserId" character varying(255) NOT NULL,
        "providerEmail" character varying(255),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_social_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_social_accounts_provider_user" UNIQUE ("provider", "providerUserId"),
        CONSTRAINT "UQ_user_social_accounts_user_provider" UNIQUE ("userId", "provider"),
        CONSTRAINT "FK_user_social_accounts_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_social_accounts"`);
    await queryRunner.query(
      `DROP TYPE "public"."user_social_accounts_provider_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL`,
    );
  }
}
