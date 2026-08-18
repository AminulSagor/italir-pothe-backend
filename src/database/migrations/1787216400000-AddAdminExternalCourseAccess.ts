import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminExternalCourseAccess1787216400000 implements MigrationInterface {
  name = 'AddAdminExternalCourseAccess1787216400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "course_enrollments"
      ALTER COLUMN "orderId" DROP NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "admin_course_access_grants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "courseId" uuid NOT NULL,
        "enrollmentId" uuid NOT NULL,
        "paymentAmount" numeric(14,2) NOT NULL,
        "paymentCurrency" varchar(3) NOT NULL,
        "amountEur" numeric(10,2) NOT NULL,
        "paymentMethod" varchar(40) NOT NULL,
        "externalReference" varchar(255) NOT NULL,
        "paidAt" timestamptz NOT NULL,
        "notes" varchar(1000),
        "status" varchar(20) NOT NULL,
        "grantedByAdminId" uuid NOT NULL,
        "revokedAt" timestamptz,
        "revokedByAdminId" uuid,
        "revokeReason" varchar(500),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_course_access_grants" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admin_course_access_grants_reference"
          UNIQUE ("externalReference"),
        CONSTRAINT "FK_admin_course_access_grants_course"
          FOREIGN KEY ("courseId") REFERENCES "courses"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_admin_course_access_grants_enrollment"
          FOREIGN KEY ("enrollmentId") REFERENCES "course_enrollments"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_admin_course_access_grants_user"
      ON "admin_course_access_grants" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_admin_course_access_grants_course"
      ON "admin_course_access_grants" ("courseId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_admin_course_access_grants_enrollment"
      ON "admin_course_access_grants" ("enrollmentId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_admin_course_access_grants_user_course"
      ON "admin_course_access_grants" ("userId", "courseId")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_admin_course_access_grants_active"
      ON "admin_course_access_grants" ("userId", "courseId")
      WHERE "status" = 'active'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "course_enrollments" WHERE "orderId" IS NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot restore course_enrollments.orderId NOT NULL while external enrollments exist';
        END IF;
      END
      $$
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_admin_course_access_grants_active"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_admin_course_access_grants_user_course"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_admin_course_access_grants_enrollment"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_admin_course_access_grants_course"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_admin_course_access_grants_user"
    `);
    await queryRunner.query(`
      DROP TABLE "admin_course_access_grants"
    `);

    await queryRunner.query(`
      ALTER TABLE "course_enrollments"
      ALTER COLUMN "orderId" SET NOT NULL
    `);
  }
}
