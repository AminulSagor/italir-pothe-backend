import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { CourseProviderProduct } from '../../course-commerce/entities/course-provider-product.entity';
import { CoursePaymentProvider } from '../../course-commerce/types/course-commerce.type';
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
