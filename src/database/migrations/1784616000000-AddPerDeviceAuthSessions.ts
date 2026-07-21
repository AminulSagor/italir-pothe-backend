import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerDeviceAuthSessions1784616000000 implements MigrationInterface {
  name = 'AddPerDeviceAuthSessions1784616000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_devices"
      ADD COLUMN IF NOT EXISTS "authSessionId" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "user_devices"
      ADD COLUMN IF NOT EXISTS "isSessionActive"
      boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "user_devices"
      ADD COLUMN IF NOT EXISTS "authSessionExpiresAt"
      timestamptz
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      "UQ_user_devices_auth_session_id"
      ON "user_devices" ("authSessionId")
      WHERE "authSessionId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS
      "UQ_user_devices_auth_session_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "user_devices"
      DROP COLUMN IF EXISTS "authSessionExpiresAt"
    `);

    await queryRunner.query(`
      ALTER TABLE "user_devices"
      DROP COLUMN IF EXISTS "isSessionActive"
    `);

    await queryRunner.query(`
      ALTER TABLE "user_devices"
      DROP COLUMN IF EXISTS "authSessionId"
    `);
  }
}
