import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { CourseProviderProduct } from '../../course-commerce/entities/course-provider-product.entity';
import { CoursePaymentProvider } from '../../course-commerce/types/course-commerce.type';
import { PublicCourseCatalogQueryDto } from '../dto/course.dto';
import { Course, CourseStatus } from '../entities/course.entity';

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,

    @InjectRepository(CourseProviderProduct)
    private readonly providerProductRepository: Repository<CourseProviderProduct>,
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

    return new Map(providerProducts.map((item) => [item.courseId, item]));
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
