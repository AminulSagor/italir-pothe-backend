import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateConversationReads1687480000000 implements MigrationInterface {
  name = 'CreateConversationReads1687480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "conversation_reads" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "conversation_id" uuid NOT NULL,
      "user_id" uuid NOT NULL,
      "last_read_message_id" uuid,
      "last_read_at" timestamptz,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_conversation_reads_conversation_user" UNIQUE ("conversation_id", "user_id")
    );`);

    await queryRunner.query(`ALTER TABLE "conversation_reads" ADD CONSTRAINT "FK_conversation_reads_conversation" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;`);
    await queryRunner.query(`ALTER TABLE "conversation_reads" ADD CONSTRAINT "FK_conversation_reads_message" FOREIGN KEY ("last_read_message_id") REFERENCES "messages"("id") ON DELETE SET NULL;`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_conversation_reads_user" ON "conversation_reads" ("user_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conversation_reads_user";`);
    await queryRunner.query(`ALTER TABLE "conversation_reads" DROP CONSTRAINT IF EXISTS "FK_conversation_reads_message";`);
    await queryRunner.query(`ALTER TABLE "conversation_reads" DROP CONSTRAINT IF EXISTS "FK_conversation_reads_conversation";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_reads";`);
  }
}
