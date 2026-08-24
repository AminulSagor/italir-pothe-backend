import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppleSocialAuthentication1787817600000
  implements MigrationInterface
{
  name = 'AddAppleSocialAuthentication1787817600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."user_social_accounts_provider_enum" ADD VALUE IF NOT EXISTS 'apple'`,
    );
  }

  // PostgreSQL cannot safely remove a live enum value without rebuilding the
  // type. Keep this additive migration forward-only to preserve linked users.
  public async down(): Promise<void> {}
}
