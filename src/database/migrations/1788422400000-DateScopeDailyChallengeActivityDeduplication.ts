import { MigrationInterface, QueryRunner } from 'typeorm';

export class DateScopeDailyChallengeActivityDeduplication1788422400000 implements MigrationInterface {
  name = 'DateScopeDailyChallengeActivityDeduplication1788422400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "xp_transactions"
      ADD COLUMN IF NOT EXISTS "activityDate" date
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_xp_transactions_activity_date"
      ON "xp_transactions" ("activityDate")
    `);
    // The original generated index name can differ between environments. Drop
    // only the legacy three-column unique index and leave all other indexes.
    await queryRunner.query(`
      DO $$
      DECLARE legacy_index record;
      BEGIN
        FOR legacy_index IN
          SELECT schemaname, indexname
          FROM pg_indexes
          WHERE tablename = 'daily_learning_activity_logs'
            AND schemaname = current_schema()
            AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
            AND indexdef LIKE '%"userId"%'
            AND indexdef LIKE '%"activityType"%'
            AND indexdef LIKE '%"sourceId"%'
            AND indexdef NOT LIKE '%"activityDate"%'
        LOOP
          EXECUTE format(
            'DROP INDEX IF EXISTS %I.%I',
            legacy_index.schemaname,
            legacy_index.indexname
          );
        END LOOP;
      END $$
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        "IDX_daily_learning_activity_daily_source"
      ON "daily_learning_activity_logs"
        ("userId", "activityType", "sourceId", "activityDate")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_xp_transactions_activity_date"
    `);
    await queryRunner.query(`
      ALTER TABLE "xp_transactions" DROP COLUMN IF EXISTS "activityDate"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_daily_learning_activity_daily_source"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        "IDX_daily_learning_activity_source"
      ON "daily_learning_activity_logs"
        ("userId", "activityType", "sourceId")
    `);
  }
}
