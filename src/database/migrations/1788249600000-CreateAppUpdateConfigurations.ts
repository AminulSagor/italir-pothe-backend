import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAppUpdateConfigurations1788249600000 implements MigrationInterface {
  name = 'CreateAppUpdateConfigurations1788249600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "app_update_configurations_platform_enum"
      AS ENUM ('android', 'ios')
    `);
    await queryRunner.query(`
      CREATE TYPE "app_update_configurations_updateType_enum"
      AS ENUM ('OPTIONAL', 'REQUIRED', 'DISABLED')
    `);
    await queryRunner.query(`
      CREATE TABLE "app_update_configurations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "platform" "app_update_configurations_platform_enum" NOT NULL,
        "latestVersion" character varying(64) NOT NULL,
        "minimumSupportedVersion" character varying(64) NOT NULL,
        "updateType" "app_update_configurations_updateType_enum" NOT NULL DEFAULT 'DISABLED',
        "title" character varying(160) NOT NULL,
        "message" character varying(1200) NOT NULL,
        "storeUrl" character varying(1000) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_app_update_configurations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_app_update_configurations_platform" UNIQUE ("platform")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "app_update_configurations" (
        "platform",
        "latestVersion",
        "minimumSupportedVersion",
        "updateType",
        "title",
        "message",
        "storeUrl",
        "enabled"
      ) VALUES
      (
        'android',
        '1.0.0',
        '1.0.0',
        'DISABLED',
        'Update available',
        'A newer version of Italir Pothe is available on Google Play.',
        'https://play.google.com/store/apps/details?id=com.shafacode.italir_pothe',
        false
      ),
      (
        'ios',
        '1.0.0',
        '1.0.0',
        'DISABLED',
        'Update available',
        'A newer version of Italir Pothe is available on the App Store.',
        'https://apps.apple.com/app/italir-pothe',
        false
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "app_update_configurations"');
    await queryRunner.query(
      'DROP TYPE "app_update_configurations_updateType_enum"',
    );
    await queryRunner.query(
      'DROP TYPE "app_update_configurations_platform_enum"',
    );
  }
}
