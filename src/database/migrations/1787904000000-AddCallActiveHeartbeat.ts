import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCallActiveHeartbeat1787904000000
  implements MigrationInterface
{
  name = 'AddCallActiveHeartbeat1787904000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "calls" DROP COLUMN IF EXISTS "lastHeartbeatAt"`,
    );
  }
}
