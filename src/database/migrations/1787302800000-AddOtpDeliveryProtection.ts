import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOtpDeliveryProtection1787302800000
  implements MigrationInterface
{
  name = 'AddOtpDeliveryProtection1787302800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "otp_rate_limit_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "identifierHash" varchar(64),
        "ipHash" varchar(64) NOT NULL,
        "purpose" varchar(50) NOT NULL,
        "action" varchar(20) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_otp_rate_limit_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_otp_rate_identifier_window"
      ON "otp_rate_limit_events"
      ("identifierHash", "purpose", "action", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_otp_rate_ip_window"
      ON "otp_rate_limit_events" ("ipHash", "action", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_otp_rate_created_at"
      ON "otp_rate_limit_events" ("createdAt")
    `);

    await queryRunner.query(`
      CREATE TABLE "email_suppressions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar(320) NOT NULL,
        "reason" varchar(40) NOT NULL,
        "sourceEventId" varchar(255),
        "details" varchar(500),
        "suppressedAt" timestamptz NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_suppressions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_email_suppressions_email" UNIQUE ("email")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_email_suppressions_source_event"
      ON "email_suppressions" ("sourceEventId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "email_suppressions"');
    await queryRunner.query('DROP TABLE "otp_rate_limit_events"');
  }
}
