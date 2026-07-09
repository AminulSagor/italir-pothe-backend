import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { CourseProviderProduct } from '../../course-commerce/entities/course-provider-product.entity';
import {
  CourseEnrollmentStatus,
  CoursePaymentProvider,
} from '../../course-commerce/types/course-commerce.type';
import { PublicCourseCatalogQueryDto } from '../dto/course.dto';
import { Course, CourseStatus } from '../entities/course.entity';
import { CourseEnrollment } from 'src/module-2/course-commerce/entities/course-enrollment.entity';
import { UserCourseProgress } from 'src/module-2/progress/entities/user-course-progress.entity';

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,

    @InjectRepository(CourseProviderProduct)
    private readonly providerProductRepository: Repository<CourseProviderProduct>,

    @InjectRepository(CourseEnrollment)
    private readonly enrollmentRepository: Repository<CourseEnrollment>,

    @InjectRepository(UserCourseProgress)
    private readonly courseProgressRepository: Repository<UserCourseProgress>,
  ) {}

  async findAllCourses(provider?: CoursePaymentProvider) {
    const courses = await this.courseRepository.find({
      where: {
        status: CourseStatus.PUBLISHED,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    if (!provider || courses.length === 0) {
      return courses.map((course) => this.mapCourse(course, null));
    }

    const providerProducts = await this.providerProductRepository.find({
      where: {
        courseId: In(courses.map((course) => course.id)),
        provider,
        isActive: true,
      },
    });

    const providerProductByCourseId = new Map(
      providerProducts.map((item) => [item.courseId, item]),
    );

    return courses
      .filter(
        (course) => course.isFree || providerProductByCourseId.has(course.id),
      )
      .map((course) =>
        this.mapCourse(
          course,
          providerProductByCourseId.get(course.id) ?? null,
        ),
      );
  }

  async findAllCoursesForUser(
    userId: string,
    provider?: CoursePaymentProvider,
  ) {
    const courses = await this.courseRepository.find({
      where: {
        status: CourseStatus.PUBLISHED,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    const availableCourses = await this.filterCoursesForProvider(
      courses,
      provider,
    );

    const providerProductByCourseId = await this.getProviderProductMap(
      availableCourses,
      provider,
    );

    const enrollmentByCourseId = await this.getEnrollmentMap(
      userId,
      availableCourses.map((course) => course.id),
    );

    const progressByCourseId = await this.getProgressMap(
      userId,
      availableCourses.map((course) => course.id),
    );

    return availableCourses.map((course) =>
      this.mapCourseForUser(
        course,
        providerProductByCourseId.get(course.id) ?? null,
        enrollmentByCourseId.get(course.id) ?? null,
        progressByCourseId.get(course.id) ?? null,
      ),
    );
  }

  async findCourseCatalogForUser(
    userId: string,
    query: PublicCourseCatalogQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const normalizedSearch = query.search?.trim().toLowerCase() ?? '';

    const courseQuery = this.courseRepository
      .createQueryBuilder('course')
      .where('course.status = :status', { status: CourseStatus.PUBLISHED })
      .orderBy('course.createdAt', 'DESC');

    if (normalizedSearch) {
      courseQuery.andWhere(
        `(
        LOWER(course.title) LIKE :search OR
        LOWER(COALESCE(course.subtitle, '')) LIKE :search OR
        LOWER(COALESCE(course.description, '')) LIKE :search
      )`,
        { search: `%${normalizedSearch}%` },
      );
    }

    const courses = await courseQuery.getMany();

    const availableCourses = await this.filterCoursesForProvider(
      courses,
      query.provider,
    );

    const total = availableCourses.length;

    const paginatedCourses = availableCourses.slice(
      (page - 1) * limit,
      page * limit,
    );

    const providerProductByCourseId = await this.getProviderProductMap(
      paginatedCourses,
      query.provider,
    );

    const enrollmentByCourseId = await this.getEnrollmentMap(
      userId,
      paginatedCourses.map((course) => course.id),
    );

    const progressByCourseId = await this.getProgressMap(
      userId,
      paginatedCourses.map((course) => course.id),
    );

    return {
      items: paginatedCourses.map((course) =>
        this.mapCourseForUser(
          course,
          providerProductByCourseId.get(course.id) ?? null,
          enrollmentByCourseId.get(course.id) ?? null,
          progressByCourseId.get(course.id) ?? null,
        ),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findCourseByIdForUser(
    userId: string,
    courseId: string,
    provider?: CoursePaymentProvider,
  ) {
    const course = await this.courseRepository.findOne({
      where: {
        id: courseId,
        status: CourseStatus.PUBLISHED,
      },
    });

    if (!course) {
      throw new NotFoundException('Course not found.');
    }

    const providerProduct = provider
      ? await this.providerProductRepository.findOne({
          where: {
            courseId,
            provider,
            isActive: true,
          },
        })
      : null;

    if (provider && !course.isFree && !providerProduct) {
      throw new NotFoundException(
        'This course is not available for the selected store provider.',
      );
    }

    const enrollment = await this.enrollmentRepository.findOne({
      where: {
        userId,
        courseId,
        status: CourseEnrollmentStatus.ACTIVE,
      },
    });

    const progress = await this.courseProgressRepository.findOne({
      where: {
        userId,
        courseId,
      },
    });

    return this.mapCourseForUser(course, providerProduct, enrollment, progress);
  }

  private async getEnrollmentMap(userId: string, courseIds: string[]) {
    if (courseIds.length === 0) {
      return new Map<string, CourseEnrollment>();
    }

    const enrollments = await this.enrollmentRepository.find({
      where: {
        userId,
        courseId: In(courseIds),
        status: CourseEnrollmentStatus.ACTIVE,
      },
    });

    return new Map(enrollments.map((item) => [item.courseId, item]));
  }

  private async getProgressMap(userId: string, courseIds: string[]) {
    if (courseIds.length === 0) {
      return new Map<string, UserCourseProgress>();
    }

    const progressList = await this.courseProgressRepository.find({
      where: {
        userId,
        courseId: In(courseIds),
      },
    });

    return new Map(progressList.map((item) => [item.courseId, item]));
  }

  private mapCourseForUser(
    course: Course,
    providerProduct: CourseProviderProduct | null,
    enrollment: CourseEnrollment | null,
    progress: UserCourseProgress | null,
  ) {
    const base = this.mapCourse(course, providerProduct);
    const isEnrolled = Boolean(enrollment);

    return {
      ...base,
      progressPercent: progress?.completionPercent ?? 0,
      userAccess: {
        isEnrolled,
        hasAccess: isEnrolled,
        label: isEnrolled ? 'active' : 'join_now',
        action: isEnrolled ? 'continue' : 'purchase',
        enrollment: enrollment
          ? {
              id: enrollment.id,
              status: enrollment.status,
              accessType: enrollment.accessType,
              enrolledAt: enrollment.enrolledAt,
              expiresAt: enrollment.expiresAt,
              lastAccessedAt: enrollment.lastAccessedAt,
            }
          : null,
      },
    };
  }

  async findCourseCatalog(query: PublicCourseCatalogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const normalizedSearch = query.search?.trim().toLowerCase() ?? '';

    const courseQuery = this.courseRepository
      .createQueryBuilder('course')
      .where('course.status = :status', { status: CourseStatus.PUBLISHED })
      .orderBy('course.createdAt', 'DESC');

    if (normalizedSearch) {
      courseQuery.andWhere(
        `(
          LOWER(course.title) LIKE :search OR
          LOWER(COALESCE(course.subtitle, '')) LIKE :search OR
          LOWER(COALESCE(course.description, '')) LIKE :search
        )`,
        { search: `%${normalizedSearch}%` },
      );
    }

    const courses = await courseQuery.getMany();
    const availableCourses = await this.filterCoursesForProvider(
      courses,
      query.provider,
    );
    const total = availableCourses.length;
    const paginatedCourses = availableCourses.slice(
      (page - 1) * limit,
      page * limit,
    );

    const providerProductByCourseId = await this.getProviderProductMap(
      paginatedCourses,
      query.provider,
    );

    return {
      items: paginatedCourses.map((course) =>
        this.mapCourse(
          course,
          providerProductByCourseId.get(course.id) ?? null,
        ),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findCourseById(courseId: string, provider?: CoursePaymentProvider) {
    const course = await this.courseRepository.findOne({
      where: {
        id: courseId,
        status: CourseStatus.PUBLISHED,
      },
    });

    if (!course) {
      throw new NotFoundException('Course not found.');
    }

    const providerProduct = provider
      ? await this.providerProductRepository.findOne({
          where: {
            courseId,
            provider,
            isActive: true,
          },
        })
      : null;

    if (provider && !course.isFree && !providerProduct) {
      throw new NotFoundException(
        'This course is not available for the selected store provider.',
      );
    }

    return this.mapCourse(course, providerProduct);
  }

  private async filterCoursesForProvider(
    courses: Course[],
    provider?: CoursePaymentProvider,
  ): Promise<Course[]> {
    if (!provider || courses.length === 0) {
      return courses;
    }

    const providerProductByCourseId = await this.getProviderProductMap(
      courses,
      provider,
    );

    return courses.filter(
      (course) => course.isFree || providerProductByCourseId.has(course.id),
    );
  }

  private async getProviderProductMap(
    courses: Course[],
    provider?: CoursePaymentProvider,
  ): Promise<Map<string, CourseProviderProduct>> {
    if (!provider || courses.length === 0) {
      return new Map<string, CourseProviderProduct>();
    }

    const providerProducts = await this.providerProductRepository.find({
      where: {
        courseId: In(courses.map((course) => course.id)),
        provider,
        isActive: true,
      },
    });

    return new Map(
      providerProducts
        .filter((item) => Boolean(item.courseId))
        .map((item) => [item.courseId as string, item]),
    );
  }

  private mapCourse(
    course: Course,
    providerProduct: CourseProviderProduct | null,
  ) {
    return {
      id: course.id,
      title: course.title,
      subtitle: course.subtitle,
      description: course.description,
      slug: course.slug,
      isFree: course.isFree,
      price: course.price,
      couponCode: course.couponCode,
      finalExamTemplateId: course.finalExamTemplateId,
      status: course.status,
      publishedAt: course.publishedAt,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      purchasable: course.isFree || Boolean(providerProduct),
      storeProduct: providerProduct
        ? {
            id: providerProduct.id,
            provider: providerProduct.provider,
            productId: providerProduct.productId,
            productType: providerProduct.productType,
            basePlanId: providerProduct.basePlanId,
            offerId: providerProduct.offerId,
            isActive: providerProduct.isActive,
          }
        : null,
    };
  }
}
