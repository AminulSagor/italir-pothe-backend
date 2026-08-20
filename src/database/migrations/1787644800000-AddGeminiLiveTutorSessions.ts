import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGeminiLiveTutorSessions1787644800000 implements MigrationInterface {
  name = 'AddGeminiLiveTutorSessions1787644800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_tutor_live_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "usageSessionId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "model" character varying(160) NOT NULL,
        "mode" character varying(20) NOT NULL DEFAULT 'assisted',
        "guidedLevel" character varying(8),
        "topic" character varying(300),
        "status" character varying(20) NOT NULL,
        "activeSeconds" integer NOT NULL DEFAULT 0,
        "lastSummarizedActiveSeconds" integer NOT NULL DEFAULT 0,
        "summaryVersion" integer NOT NULL DEFAULT 0,
        "summaryAttemptCount" integer NOT NULL DEFAULT 0,
        "rollingSummary" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "pendingTranscript" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "processedEventIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "resumptionHandle" text,
        "lastSummaryAt" TIMESTAMP WITH TIME ZONE,
        "summaryLeaseUntil" TIMESTAMP WITH TIME ZONE,
        "finalSummary" jsonb,
        "summaryError" text,
        "endedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_tutor_live_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ai_tutor_live_sessions_usage" UNIQUE ("usageSessionId"),
        CONSTRAINT "FK_ai_tutor_live_sessions_usage" FOREIGN KEY ("usageSessionId") REFERENCES "ai_tutor_voice_usage_sessions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_tutor_live_sessions_user_created" ON "ai_tutor_live_sessions" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_tutor_live_sessions_summary_due" ON "ai_tutor_live_sessions" ("status", "summaryLeaseUntil")`,
    );

    await queryRunner.query(`
      CREATE TABLE "ai_tutor_learning_memories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "memory" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "lastSessionId" uuid,
        "version" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_tutor_learning_memories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ai_tutor_learning_memories_user" UNIQUE ("userId")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_tutor_learning_memories"`);
    await queryRunner.query(`DROP TABLE "ai_tutor_live_sessions"`);
  }
}
