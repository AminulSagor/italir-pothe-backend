import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { CourseEnrollment } from 'src/module-2/course-commerce/entities/course-enrollment.entity';
import { CourseEnrollmentStatus } from 'src/module-2/course-commerce/types/course-commerce.type';
import { Course } from 'src/module-2/courses/entities/course.entity';
import { UserCourseEnrollment } from 'src/module-2/courses/entities/user-course-enrollment.entity';

@Injectable()
export class WebinarAudienceService {
  private static readonly inactiveLegacyStatuses = [
    'cancelled',
    'expired',
    'inactive',
    'refunded',
    'revoked',
  ];

  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,

    @InjectRepository(CourseEnrollment)
    private readonly courseEnrollmentRepository: Repository<CourseEnrollment>,

    @InjectRepository(UserCourseEnrollment)
    private readonly legacyEnrollmentRepository: Repository<UserCourseEnrollment>,
  ) {}

  async validateCourseIds(courseIds: string[]): Promise<void> {
    if (courseIds.length === 0) {
      return;
    }

    const courses = await this.courseRepository.find({
      where: {
        id: In(courseIds),
      },
      select: {
        id: true,
      },
    });

    if (courses.length !== courseIds.length) {
      throw new BadRequestException(
        'One or more selected audience courses do not exist.',
      );
    }
  }

  async getCourseTitleMap(courseIds: string[]): Promise<Map<string, string>> {
    if (courseIds.length === 0) {
      return new Map<string, string>();
    }

    const courses = await this.courseRepository.find({
      where: {
        id: In(courseIds),
      },
      select: {
        id: true,
        title: true,
      },
    });

    return new Map(
      courses.map((course) => [course.id, course.title.trim()]),
    );
  }

  async getUserEnrolledCourseIds(
    userId: string,
    courseIds: string[],
  ): Promise<Set<string>> {
    if (courseIds.length === 0) {
      return new Set<string>();
    }

    const [commerceRows, legacyRows] = await Promise.all([
      this.courseEnrollmentRepository
        .createQueryBuilder('enrollment')
        .select('DISTINCT enrollment.courseId', 'courseId')
        .where('enrollment.userId = :userId', { userId })
        .andWhere('enrollment.courseId IN (:...courseIds)', { courseIds })
        .andWhere('enrollment.status = :status', {
          status: CourseEnrollmentStatus.ACTIVE,
        })
        .andWhere(
          '(enrollment.expiresAt IS NULL OR enrollment.expiresAt > :now)',
          { now: new Date() },
        )
        .getRawMany<{ courseId: string }>(),
      this.legacyEnrollmentRepository
        .createQueryBuilder('enrollment')
        .select('DISTINCT enrollment.courseId', 'courseId')
        .where('enrollment.userId = :userId', { userId })
        .andWhere('enrollment.courseId IN (:...courseIds)', { courseIds })
        .andWhere('LOWER(enrollment.status) NOT IN (:...inactiveStatuses)', {
          inactiveStatuses: WebinarAudienceService.inactiveLegacyStatuses,
        })
        .getRawMany<{ courseId: string }>(),
    ]);

    return new Set<string>([
      ...commerceRows.map((row) => row.courseId),
      ...legacyRows.map((row) => row.courseId),
    ]);
  }

  async getEligibleUserIds(courseIds: string[]): Promise<string[]> {
    if (courseIds.length === 0) {
      return [];
    }

    const [commerceRows, legacyRows] = await Promise.all([
      this.courseEnrollmentRepository
        .createQueryBuilder('enrollment')
        .select('DISTINCT enrollment.userId', 'userId')
        .where('enrollment.courseId IN (:...courseIds)', { courseIds })
        .andWhere('enrollment.status = :status', {
          status: CourseEnrollmentStatus.ACTIVE,
        })
        .andWhere(
          '(enrollment.expiresAt IS NULL OR enrollment.expiresAt > :now)',
          { now: new Date() },
        )
        .getRawMany<{ userId: string }>(),
      this.legacyEnrollmentRepository
        .createQueryBuilder('enrollment')
        .select('DISTINCT enrollment.userId', 'userId')
        .where('enrollment.courseId IN (:...courseIds)', { courseIds })
        .andWhere('LOWER(enrollment.status) NOT IN (:...inactiveStatuses)', {
          inactiveStatuses: WebinarAudienceService.inactiveLegacyStatuses,
        })
        .getRawMany<{ userId: string }>(),
    ]);

    return Array.from(
      new Set<string>([
        ...commerceRows.map((row) => row.userId),
        ...legacyRows.map((row) => row.userId),
      ]),
    );
  }

  isEligible(
    courseIds: string[],
    enrolledCourseIds: ReadonlySet<string>,
  ): boolean {
    return (
      courseIds.length === 0 ||
      courseIds.some((courseId) => enrolledCourseIds.has(courseId))
    );
  }
}
