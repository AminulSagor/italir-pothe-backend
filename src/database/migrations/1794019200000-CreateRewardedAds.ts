import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRewardedAds1794019200000 implements MigrationInterface {
  name = 'CreateRewardedAds1794019200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ DECLARE enum_name text; BEGIN FOR enum_name IN SELECT t.typname FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid GROUP BY t.typname HAVING bool_or(e.enumlabel='ai_bundle') AND bool_or(e.enumlabel='cv_credit') LOOP EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS ''ad_free''', enum_name); END LOOP; END $$`,
    );
    await queryRunner.query(
      `CREATE TYPE "rewarded_ad_sessions_placement_enum" AS ENUM ('free_video','daily_challenge_xp','daily_chest','career_module','quiz_open','quiz_review','vocabulary_reveal','survival_pdf','verb_detail','call_credits','cv_credits')`,
    );
    await queryRunner.query(
      `CREATE TYPE "rewarded_ad_sessions_status_enum" AS ENUM ('pending','verified','granted','expired')`,
    );
    await queryRunner.query(
      `CREATE TABLE "rewarded_user_states" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "counters" jsonb NOT NULL DEFAULT '{}', "outgoingCallsUsed" integer NOT NULL DEFAULT 0, "callCredits" integer NOT NULL DEFAULT 0, "dailyBonusDate" date, "dailyBonusCount" integer NOT NULL DEFAULT 0, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_rewarded_user_states" PRIMARY KEY ("id"), CONSTRAINT "UQ_rewarded_user_states_user" UNIQUE ("userId"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "rewarded_ad_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "placement" "rewarded_ad_sessions_placement_enum" NOT NULL, "contextId" varchar(120), "status" "rewarded_ad_sessions_status_enum" NOT NULL DEFAULT 'pending', "transactionId" varchar(160), "expiresAt" timestamptz NOT NULL, "verifiedAt" timestamptz, "grantedAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_rewarded_ad_sessions" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rewarded_ad_sessions_user_created" ON "rewarded_ad_sessions" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_rewarded_ad_sessions_transaction" ON "rewarded_ad_sessions" ("transactionId") WHERE "transactionId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "rewarded_ad_sessions"`);
    await queryRunner.query(`DROP TABLE "rewarded_user_states"`);
    await queryRunner.query(`DROP TYPE "rewarded_ad_sessions_status_enum"`);
    await queryRunner.query(`DROP TYPE "rewarded_ad_sessions_placement_enum"`);
  }
}
