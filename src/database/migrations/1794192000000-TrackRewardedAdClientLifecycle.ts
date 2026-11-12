import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrackRewardedAdClientLifecycle1794192000000 implements MigrationInterface {
  name = 'TrackRewardedAdClientLifecycle1794192000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "rewarded_ad_sessions" ADD "adShownAt" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "rewarded_ad_sessions" ADD "clientEarnedAt" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "rewarded_ad_sessions" ADD "canceledAt" timestamptz`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rewarded_ad_sessions_pending_placement" ON "rewarded_ad_sessions" ("userId", "placement", "createdAt") WHERE "status" = 'pending'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rewarded_ad_sessions_pending_placement"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rewarded_ad_sessions" DROP COLUMN "canceledAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rewarded_ad_sessions" DROP COLUMN "clientEarnedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rewarded_ad_sessions" DROP COLUMN "adShownAt"`,
    );
  }
}
