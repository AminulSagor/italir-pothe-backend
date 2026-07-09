import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeCourseDeleteIndependent1783728000000 implements MigrationInterface {
  name = 'MakeCourseDeleteIndependent1783728000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.makeCourseReferenceNullable(
      queryRunner,
      'course_purchase_orders',
    );
    await this.makeCourseReferenceNullable(queryRunner, 'course_enrollments');
    await this.makeCourseReferenceNullable(queryRunner, 'certificates');
    await this.makeCourseReferenceNullable(queryRunner, 'exam_attempts');
    await this.makeCourseReferenceNullable(
      queryRunner,
      'course_provider_products',
    );
    await this.makeCourseReferenceNullable(
      queryRunner,
      'user_course_enrollments',
    );
    await this.makeCourseReferenceNullable(queryRunner, 'course_chapters');
    await this.makeCourseReferenceNullable(queryRunner, 'lessons');
    await this.makeCourseReferenceNullable(queryRunner, 'exam_templates');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    /*
     * Do not force NOT NULL in down migration because production data may
     * already contain historical records with courseId = NULL after a course
     * permanent delete.
     *
     * If rollback is ever needed, restore only FK behavior manually after
     * checking NULL data.
     */
  }

  private async makeCourseReferenceNullable(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        constraint_record RECORD;
      BEGIN
        FOR constraint_record IN
          SELECT con.conname
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_attribute att
            ON att.attrelid = rel.oid
            AND att.attnum = ANY(con.conkey)
          JOIN pg_class foreign_rel ON foreign_rel.oid = con.confrelid
          WHERE rel.relname = '${tableName}'
          AND att.attname = 'courseId'
          AND foreign_rel.relname = 'courses'
          AND con.contype = 'f'
        LOOP
          EXECUTE format(
            'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
            '${tableName}',
            constraint_record.conname
          );
        END LOOP;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "${tableName}"
      ALTER COLUMN "courseId" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "${tableName}"
      ADD CONSTRAINT "FK_${tableName}_courseId_courses_set_null"
      FOREIGN KEY ("courseId")
      REFERENCES "courses"("id")
      ON DELETE SET NULL
    `);
  }
}
