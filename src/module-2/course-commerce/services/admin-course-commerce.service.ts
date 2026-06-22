import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Course } from '../../courses/entities/course.entity';
import { AdminEnrollmentQueryDto } from '../dto/admin-course-commerce.dto';
import { CourseEnrollment } from '../entities/course-enrollment.entity';
import { CoursePaymentAttempt } from '../entities/course-payment-attempt.entity';
import { CoursePurchaseOrder } from '../entities/course-purchase-order.entity';
import { DemoPaymentGatewayService } from '../providers/demo-payment-gateway.service';
import {
  CommerceCurrency,
  CommerceSortOrder,
  CourseEnrollmentStatus,
  CoursePaymentAttemptStatus,
  CoursePurchaseStatus,
} from '../types/course-commerce.type';

@Injectable()
export class AdminCourseCommerceService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,

    @InjectRepository(CoursePurchaseOrder)
    private readonly purchaseOrderRepository: Repository<CoursePurchaseOrder>,

    @InjectRepository(CourseEnrollment)
    private readonly enrollmentRepository: Repository<CourseEnrollment>,

    private readonly dataSource: DataSource,

    private readonly demoPaymentGateway: DemoPaymentGatewayService,
  ) {}

  async getEnrollmentSummary(courseId: string) {
    await this.getCourse(courseId);

    const now = new Date();

    const activeThreshold = new Date(now.getTime() - 15 * 60 * 1000);

    const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

    const lastThirtyDays = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const totalStudents = await this.enrollmentRepository.count({
      where: {
        courseId,
        status: CourseEnrollmentStatus.ACTIVE,
      },
    });

    const activeNow = await this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .where('enrollment.courseId = :courseId', { courseId })
      .andWhere('enrollment.status = :status', {
        status: CourseEnrollmentStatus.ACTIVE,
      })
      .andWhere('enrollment.lastAccessedAt >= :activeThreshold', {
        activeThreshold,
      })
      .getCount();

    const revenueResult = await this.purchaseOrderRepository
      .createQueryBuilder('purchaseOrder')
      .select('COALESCE(SUM(purchaseOrder.payableAmountEur), 0)', 'total')
      .where('purchaseOrder.courseId = :courseId', { courseId })
      .andWhere('purchaseOrder.status = :status', {
        status: CoursePurchaseStatus.PAID,
      })
      .andWhere('purchaseOrder.paidAt >= :startOfYear', { startOfYear })
      .getRawOne<{
        total: string;
      }>();

    const refundedLast30Days = await this.purchaseOrderRepository
      .createQueryBuilder('purchaseOrder')
      .where('purchaseOrder.courseId = :courseId', { courseId })
      .andWhere('purchaseOrder.status = :status', {
        status: CoursePurchaseStatus.REFUNDED,
      })
      .andWhere('purchaseOrder.refundedAt >= :lastThirtyDays', {
        lastThirtyDays,
      })
      .getCount();

    return {
      courseId,
      totalStudents,
      activeNow,
      revenueYtd: {
        currency: CommerceCurrency.EUR,
        amount: revenueResult?.total ?? '0.00',
      },
      refundedLast30Days,
      activeWindowMinutes: 15,
    };
  }

  async findCourseEnrollments(
    courseId: string,
    query: AdminEnrollmentQueryDto,
  ) {
    await this.getCourse(courseId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const sortOrder = query.sortOrder ?? CommerceSortOrder.DESC;

    const queryBuilder = this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .leftJoinAndSelect('enrollment.user', 'user')
      .leftJoinAndSelect('enrollment.order', 'purchaseOrder')
      .where('enrollment.courseId = :courseId', { courseId })
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      queryBuilder.andWhere('enrollment.status = :status', {
        status: query.status,
      });
    }

    if (query.paymentProvider) {
      queryBuilder.andWhere(
        'purchaseOrder.paymentProvider = :paymentProvider',
        {
          paymentProvider: query.paymentProvider,
        },
      );
    }

    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;

      queryBuilder.andWhere(
        `(
          purchaseOrder.orderNumber ILIKE :search
          OR CAST(enrollment.userId AS TEXT) ILIKE :search
          OR user.email ILIKE :search
        )`,
        { search },
      );
    }

    if (query.sortBy === 'amountPaid') {
      queryBuilder.orderBy('purchaseOrder.payableAmountEur', sortOrder);
    } else {
      queryBuilder.orderBy('enrollment.enrolledAt', sortOrder);
    }

    const [enrollments, total] = await queryBuilder.getManyAndCount();

    return {
      items: enrollments.map((enrollment) => ({
        id: enrollment.id,
        student: this.mapUser(enrollment.user),
        order: enrollment.order
          ? {
              id: enrollment.order.id,
              orderNumber: enrollment.order.orderNumber,
              amountPaid: enrollment.order.paymentAmount,
              currency: enrollment.order.paymentCurrency,
              amountPaidEur: enrollment.order.payableAmountEur,
              paymentProvider: enrollment.order.paymentProvider,
              status: enrollment.order.status,
            }
          : null,
        enrollmentStatus: enrollment.status,
        accessType: enrollment.accessType,
        enrolledAt: enrollment.enrolledAt,
        refundedAt: enrollment.refundedAt,
        lastAccessedAt: enrollment.lastAccessedAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findEnrollmentById(enrollmentId: string) {
    const enrollment = await this.enrollmentRepository.findOne({
      where: {
        id: enrollmentId,
      },
      relations: {
        user: true,
        course: true,
        order: true,
      },
    });

    if (!enrollment) {
      throw new NotFoundException('Course enrollment not found.');
    }

    return {
      id: enrollment.id,
      student: this.mapUser(enrollment.user),
      course: {
        id: enrollment.courseId,
        title: enrollment.course?.title ?? null,
        subtitle: enrollment.course?.subtitle ?? null,
      },
      order: enrollment.order
        ? {
            id: enrollment.order.id,
            orderNumber: enrollment.order.orderNumber,
            basePriceEur: enrollment.order.basePriceEur,
            couponCode: enrollment.order.couponCodeSnapshot,
            discountPercentage: enrollment.order.discountPercentage,
            discountAmountEur: enrollment.order.discountAmountEur,
            payableAmountEur: enrollment.order.payableAmountEur,
            paymentCurrency: enrollment.order.paymentCurrency,
            forexRate: enrollment.order.forexRateSnapshot,
            paymentAmount: enrollment.order.paymentAmount,
            paymentProvider: enrollment.order.paymentProvider,
            status: enrollment.order.status,
            paidAt: enrollment.order.paidAt,
            refundedAt: enrollment.order.refundedAt,
          }
        : null,
      status: enrollment.status,
      accessType: enrollment.accessType,
      enrolledAt: enrollment.enrolledAt,
      expiresAt: enrollment.expiresAt,
      refundedAt: enrollment.refundedAt,
      lastAccessedAt: enrollment.lastAccessedAt,
    };
  }

  async demoRefund(orderId: string) {
    this.demoPaymentGateway.assertDemoModeEnabled();

    return this.dataSource.transaction(async (manager) => {
      const orderRepository = manager.getRepository(CoursePurchaseOrder);

      const enrollmentRepository = manager.getRepository(CourseEnrollment);

      const attemptRepository = manager.getRepository(CoursePaymentAttempt);

      const order = await orderRepository
        .createQueryBuilder('purchaseOrder')
        .setLock('pessimistic_write')
        .where('purchaseOrder.id = :orderId', { orderId })
        .getOne();

      if (!order) {
        throw new NotFoundException('Purchase order not found.');
      }

      if (order.status === CoursePurchaseStatus.REFUNDED) {
        throw new ConflictException('Purchase order was already refunded.');
      }

      if (order.status !== CoursePurchaseStatus.PAID) {
        throw new BadRequestException('Only a paid order can be refunded.');
      }

      const now = new Date();

      order.status = CoursePurchaseStatus.REFUNDED;

      order.refundedAt = now;

      await orderRepository.save(order);

      /*
       * Revoke access only when this order is
       * still the enrollment's current order.
       * This prevents refunding an old order
       * from revoking a later repurchase.
       */
      const enrollment = await enrollmentRepository.findOne({
        where: {
          userId: order.userId,
          courseId: order.courseId,
          orderId: order.id,
        },
      });

      if (enrollment) {
        enrollment.status = CourseEnrollmentStatus.REFUNDED;

        enrollment.refundedAt = now;

        await enrollmentRepository.save(enrollment);
      }

      const reference = `refund_demo_${order.id.replace(/-/g, '')}`;

      const attempt = attemptRepository.create({
        orderId: order.id,
        paymentProvider: order.paymentProvider,
        status: CoursePaymentAttemptStatus.REFUNDED,
        providerReference: reference,
        amount: order.paymentAmount,
        currency: order.paymentCurrency,
        failureCode: null,
        failureMessage: null,
        completedAt: now,
      });

      await attemptRepository.save(attempt);

      return {
        message: 'Demo refund completed successfully.',
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        enrollmentStatus: enrollment?.status ?? null,
        refundedAt: now,
      };
    });
  }

  private async getCourse(courseId: string): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: {
        id: courseId,
      },
    });

    if (!course) {
      throw new NotFoundException('Course not found.');
    }

    return course;
  }

  private mapUser(user: unknown) {
    const record = (user ?? {}) as Record<string, unknown>;

    const firstName = this.readString(record, ['firstName', 'givenName']);

    const lastName = this.readString(record, ['lastName', 'familyName']);

    const explicitName = this.readString(record, [
      'fullName',
      'name',
      'displayName',
    ]);

    const composedName =
      [firstName, lastName].filter(Boolean).join(' ') || null;

    return {
      id: this.readString(record, ['id']),
      name: explicitName ?? composedName,
      firstName,
      lastName,
      email: this.readString(record, ['email']),
      phone: this.readString(record, ['phoneNumber', 'phone']),
      avatarUrl: this.readString(record, ['avatarUrl', 'profileImageUrl']),
    };
  }

  private readString(
    record: Record<string, unknown>,
    keys: string[],
  ): string | null {
    for (const key of keys) {
      const value = record[key];

      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }

    return null;
  }
}
