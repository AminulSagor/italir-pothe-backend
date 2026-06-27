import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserLearningActivityTimeEntriesTable1782564000000 implements MigrationInterface {
  name = 'CreateUserLearningActivityTimeEntriesTable1782564000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query(`
      CREATE TABLE "user_learning_activity_time_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "eventId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "activityDate" date NOT NULL,
        "activityType" character varying(40) NOT NULL,
        "sourceId" character varying(180),
        "durationSeconds" integer NOT NULL,
        "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_learning_activity_time_entries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_learning_activity_time_event" UNIQUE ("userId", "eventId")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_user_learning_activity_time_user_date"
      ON "user_learning_activity_time_entries" ("userId", "activityDate")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_user_learning_activity_time_user_date"',
    );
    await queryRunner.query('DROP TABLE "user_learning_activity_time_entries"');
  }
}
