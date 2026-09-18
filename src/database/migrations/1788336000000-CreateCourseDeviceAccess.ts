import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCourseDeviceAccess1788336000000 implements MigrationInterface {
  name = 'CreateCourseDeviceAccess1788336000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "course_device_platform_enum" AS ENUM ('android', 'ios')`,
    );
    await queryRunner.query(
      `CREATE TYPE "course_device_authorization_status_enum" AS ENUM ('candidate', 'active', 'revoked')`,
    );
    await queryRunner.query(
      `CREATE TYPE "course_device_request_status_enum" AS ENUM ('pending', 'approved_replace', 'approved_add', 'rejected')`,
    );

    await queryRunner.query(`
      CREATE TABLE "course_device_authorizations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "courseId" uuid NOT NULL,
        "deviceKeyId" character varying(180) NOT NULL,
        "deviceLabel" character varying(160) NOT NULL,
        "platform" "course_device_platform_enum" NOT NULL,
        "status" "course_device_authorization_status_enum" NOT NULL,
        "publicKeyPem" text NOT NULL,
        "attestationReceipt" text,
        "assertionCounter" integer NOT NULL DEFAULT 0,
        "activatedAt" TIMESTAMP WITH TIME ZONE,
        "revokedAt" TIMESTAMP WITH TIME ZONE,
        "lastVerifiedAt" TIMESTAMP WITH TIME ZONE,
        "accessTokenHash" character varying(128),
        "accessTokenExpiresAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_course_device_authorizations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_course_device_authorization_device" UNIQUE ("userId", "courseId", "deviceKeyId"),
        CONSTRAINT "FK_course_device_authorizations_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_course_device_authorizations_course" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_course_device_authorization_active" ON "course_device_authorizations" ("userId", "courseId", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "course_device_challenges" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "courseId" uuid NOT NULL,
        "platform" "course_device_platform_enum" NOT NULL,
        "deviceKeyId" character varying(180) NOT NULL,
        "deviceLabel" character varying(160) NOT NULL,
        "challengeHash" character varying(128) NOT NULL,
        "clientDataBase64" text NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "consumedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_course_device_challenges" PRIMARY KEY ("id"),
        CONSTRAINT "FK_course_device_challenges_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_course_device_challenges_course" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_course_device_challenge_lookup" ON "course_device_challenges" ("id", "userId", "courseId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_course_device_challenge_expiry" ON "course_device_challenges" ("expiresAt")`,
    );

    await queryRunner.query(`
      CREATE TABLE "course_device_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "courseId" uuid NOT NULL,
        "currentAuthorizationId" uuid,
        "requestedAuthorizationId" uuid NOT NULL,
        "status" "course_device_request_status_enum" NOT NULL,
        "decidedByUserId" uuid,
        "decidedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_course_device_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_course_device_requests_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_course_device_requests_course" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_course_device_requests_current" FOREIGN KEY ("currentAuthorizationId") REFERENCES "course_device_authorizations"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_course_device_requests_requested" FOREIGN KEY ("requestedAuthorizationId") REFERENCES "course_device_authorizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_course_device_requests_admin" FOREIGN KEY ("decidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_course_device_requests_status_created" ON "course_device_requests" ("status", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_course_device_pending_request" ON "course_device_requests" ("userId", "courseId", "requestedAuthorizationId") WHERE "status" = 'pending'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "course_device_requests"`);
    await queryRunner.query(`DROP TABLE "course_device_challenges"`);
    await queryRunner.query(`DROP TABLE "course_device_authorizations"`);
    await queryRunner.query(`DROP TYPE "course_device_request_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "course_device_authorization_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "course_device_platform_enum"`);
  }
}
