import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';

import { Course, CourseStatus } from '../../courses/entities/course.entity';
import {
  ConfirmGooglePlayDemoDto,
  ConfirmStripeDemoDto,
  CourseQuoteQueryDto,
  CreateCoursePurchaseOrderDto,
  MyEnrollmentQueryDto,
  PurchaseHistoryQueryDto,
} from '../dto/course-commerce.dto';
import { CourseEnrollment } from '../entities/course-enrollment.entity';
import { CoursePaymentAttempt } from '../entities/course-payment-attempt.entity';
import { CoursePurchaseOrder } from '../entities/course-purchase-order.entity';
import {
  DemoPaymentConfirmation,
  DemoPaymentGatewayService,
} from '../providers/demo-payment-gateway.service';
import { FOREX_RATE_PROVIDER } from '../providers/forex-rate-provider';
import type { ForexRateProvider } from '../providers/forex-rate-provider';
import {
  CommerceCurrency,
  CourseAccessType,
  CourseEnrollmentStatus,
  CoursePaymentAttemptStatus,
  CoursePaymentProvider,
  CoursePurchaseStatus,
} from '../types/course-commerce.type';
import {
  calculatePercentageDiscount,
  convertEurToBdt,
  isPositiveMoney,
  normalizeMoney,
  subtractMoney,
  zeroMoney,
} from 'src/common/utils/commerce-money.util';

type CalculatedCourseQuote = {
  basePriceEur: string;
  couponCode: string | null;
  discountPercentage: number;
  discountAmountEur: string;
  payableAmountEur: string;
  selectedCurrency: CommerceCurrency;
  forexRate: string | null;
  originalAmount: string;
  discountAmount: string;
  payableAmount: string;
};

@Injectable()
export class CourseCommerceService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,

    @InjectRepository(CoursePurchaseOrder)
    private readonly purchaseOrderRepository: Repository<CoursePurchaseOrder>,

    @InjectRepository(CourseEnrollment)
    private readonly enrollmentRepository: Repository<CourseEnrollment>,

    private readonly dataSource: DataSource,

    private readonly demoPaymentGateway: DemoPaymentGatewayService,

    @Inject(FOREX_RATE_PROVIDER)
    private readonly forexRateProvider: ForexRateProvider,
  ) {}

  async getQuote(userId: string, courseId: string, query: CourseQuoteQueryDto) {
    const course = await this.getPublishedCourse(courseId);

    const quote = await this.calculateQuote(
      course,
      query.currency,
      query.couponCode,
    );

    const enrollment = await this.enrollmentRepository.findOne({
      where: {
        userId,
        courseId,
        status: CourseEnrollmentStatus.ACTIVE,
      },
    });

    return {
      course: {
        id: course.id,
        title: course.title,
        subtitle: course.subtitle,
        isFree: course.isFree,
      },
      baseCurrency: CommerceCurrency.EUR,
      selectedCurrency: quote.selectedCurrency,
      basePriceEur: quote.basePriceEur,
      originalAmount: quote.originalAmount,
      couponCode: quote.couponCode,
      discountPercentage: quote.discountPercentage,
      discountAmount: quote.discountAmount,
      payableAmount: quote.payableAmount,
      discountAmountEur: quote.discountAmountEur,
      payableAmountEur: quote.payableAmountEur,
      forexRate: quote.forexRate,
      alreadyEnrolled: Boolean(enrollment),
      supportedProviders: [
        {
          provider: CoursePaymentProvider.GOOGLE_PLAY,
          demo: true,
        },
        {
          provider: CoursePaymentProvider.STRIPE,
          demo: true,
        },
      ],
    };
  }

  async createOrder(userId: string, dto: CreateCoursePurchaseOrderDto) {
    const course = await this.getPublishedCourse(dto.courseId);

    if (course.isFree) {
      throw new BadRequestException(
        'This course is free and does not require a purchase order.',
      );
    }

    const existingEnrollment = await this.enrollmentRepository.findOne({
      where: {
        userId,
        courseId: course.id,
        status: CourseEnrollmentStatus.ACTIVE,
      },
    });

    if (existingEnrollment) {
      throw new ConflictException('You already have access to this course.');
    }

    const existingOrder = await this.purchaseOrderRepository.findOne({
      where: {
        userId,
        idempotencyKey: dto.idempotencyKey,
      },
      relations: {
        course: true,
      },
    });

    if (existingOrder) {
      this.assertIdempotentOrderMatches(existingOrder, dto);

      const response = await this.buildOrderResponse(existingOrder);

      if (
        existingOrder.status === CoursePurchaseStatus.PENDING ||
        existingOrder.status === CoursePurchaseStatus.PROCESSING
      ) {
        return {
          ...response,
          checkoutAction:
            this.demoPaymentGateway.buildCheckoutAction(existingOrder),
        };
      }

      return response;
    }

    const quote = await this.calculateQuote(
      course,
      dto.currency,
      dto.couponCode,
    );

    const order = this.purchaseOrderRepository.create({
      orderNumber: this.generateOrderNumber(),
      userId,
      courseId: course.id,
      basePriceEur: quote.basePriceEur,
      couponCodeSnapshot: quote.couponCode,
      discountPercentage: quote.discountPercentage,
      discountAmountEur: quote.discountAmountEur,
      payableAmountEur: quote.payableAmountEur,
      paymentCurrency: quote.selectedCurrency,
      forexRateSnapshot: quote.forexRate,
      paymentAmount: quote.payableAmount,
      paymentProvider: dto.paymentProvider,
      status: CoursePurchaseStatus.PENDING,
      idempotencyKey: dto.idempotencyKey,
      paidAt: null,
      refundedAt: null,
    });

    const savedOrder = await this.purchaseOrderRepository.save(order);

    savedOrder.course = course;

    return {
      ...(await this.buildOrderResponse(savedOrder)),
      checkoutAction: this.demoPaymentGateway.buildCheckoutAction(savedOrder),
    };
  }

  async confirmGooglePlayDemo(params: {
    userId: string;
    orderId: string;
    dto: ConfirmGooglePlayDemoDto;
  }) {
    const order = await this.getOwnedOrder(params.userId, params.orderId);

    this.assertConfirmableProvider(order, CoursePaymentProvider.GOOGLE_PLAY);

    const confirmation = this.demoPaymentGateway.confirmGooglePlay({
      order,
      dto: params.dto,
    });

    return this.completePayment(order.id, confirmation);
  }

  async confirmStripeDemo(params: {
    userId: string;
    orderId: string;
    dto: ConfirmStripeDemoDto;
  }) {
    const order = await this.getOwnedOrder(params.userId, params.orderId);

    this.assertConfirmableProvider(order, CoursePaymentProvider.STRIPE);

    const confirmation = this.demoPaymentGateway.confirmStripe({
      order,
      dto: params.dto,
    });

    return this.completePayment(order.id, confirmation);
  }

  async findOrderById(userId: string, orderId: string) {
    const order = await this.getOwnedOrder(userId, orderId);

    return this.buildOrderResponse(order);
  }

  async findPurchaseHistory(userId: string, query: PurchaseHistoryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const queryBuilder = this.purchaseOrderRepository
      .createQueryBuilder('purchaseOrder')
      .leftJoinAndSelect('purchaseOrder.course', 'course')
      .where('purchaseOrder.userId = :userId', { userId })
      .orderBy('purchaseOrder.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      queryBuilder.andWhere('purchaseOrder.status = :status', {
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

    const [orders, total] = await queryBuilder.getManyAndCount();

    return {
      items: orders.map((order) => this.mapOrderResponse(order)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findMyEnrollments(userId: string, query: MyEnrollmentQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const queryBuilder = this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .leftJoinAndSelect('enrollment.course', 'course')
      .leftJoinAndSelect('enrollment.order', 'purchaseOrder')
      .where('enrollment.userId = :userId', { userId })
      .orderBy('enrollment.enrolledAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      queryBuilder.andWhere('enrollment.status = :status', {
        status: query.status,
      });
    }

    const [enrollments, total] = await queryBuilder.getManyAndCount();

    return {
      items: enrollments.map((enrollment) => ({
        id: enrollment.id,
        course: {
          id: enrollment.courseId,
          title: enrollment.course?.title ?? null,
          subtitle: enrollment.course?.subtitle ?? null,
        },
        status: enrollment.status,
        accessType: enrollment.accessType,
        enrolledAt: enrollment.enrolledAt,
        expiresAt: enrollment.expiresAt,
        refundedAt: enrollment.refundedAt,
        lastAccessedAt: enrollment.lastAccessedAt,
        purchase: enrollment.order
          ? {
              orderId: enrollment.order.id,
              orderNumber: enrollment.order.orderNumber,
              amountPaid: enrollment.order.paymentAmount,
              currency: enrollment.order.paymentCurrency,
              amountPaidEur: enrollment.order.payableAmountEur,
              paymentProvider: enrollment.order.paymentProvider,
              status: enrollment.order.status,
            }
          : null,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getCourseAccess(userId: string, courseId: string) {
    await this.getPublishedCourse(courseId);

    const enrollment = await this.enrollmentRepository.findOne({
      where: {
        userId,
        courseId,
        status: CourseEnrollmentStatus.ACTIVE,
      },
    });

    return {
      courseId,
      hasAccess: Boolean(enrollment),
      enrollment: enrollment
        ? {
            id: enrollment.id,
            status: enrollment.status,
            accessType: enrollment.accessType,
            enrolledAt: enrollment.enrolledAt,
            expiresAt: enrollment.expiresAt,
          }
        : null,
    };
  }

  async recordCourseAccess(userId: string, courseId: string) {
    const enrollment = await this.enrollmentRepository.findOne({
      where: {
        userId,
        courseId,
        status: CourseEnrollmentStatus.ACTIVE,
      },
    });

    if (!enrollment) {
      throw new BadRequestException(
        'An active enrollment is required to access this course.',
      );
    }

    enrollment.lastAccessedAt = new Date();

    await this.enrollmentRepository.save(enrollment);

    return {
      message: 'Course access recorded successfully.',
      courseId,
      enrollmentId: enrollment.id,
      lastAccessedAt: enrollment.lastAccessedAt,
    };
  }

  private async completePayment(
    orderId: string,
    confirmation: DemoPaymentConfirmation,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const orderRepository = manager.getRepository(CoursePurchaseOrder);

      const attemptRepository = manager.getRepository(CoursePaymentAttempt);

      const enrollmentRepository = manager.getRepository(CourseEnrollment);

      const order = await orderRepository
        .createQueryBuilder('purchaseOrder')
        .setLock('pessimistic_write')
        .where('purchaseOrder.id = :orderId', { orderId })
        .getOne();

      if (!order) {
        throw new NotFoundException('Purchase order not found.');
      }

      if (order.status === CoursePurchaseStatus.PAID) {
        const enrollment = await enrollmentRepository.findOne({
          where: {
            userId: order.userId,
            courseId: order.courseId,
          },
        });

        return {
          message: 'Purchase was already completed.',
          order: await this.buildOrderResponse(order),
          enrollment: enrollment
            ? {
                id: enrollment.id,
                courseId: enrollment.courseId,
                status: enrollment.status,
                accessType: enrollment.accessType,
                enrolledAt: enrollment.enrolledAt,
              }
            : null,
        };
      }

      if (
        order.status !== CoursePurchaseStatus.PENDING &&
        order.status !== CoursePurchaseStatus.PROCESSING
      ) {
        throw new BadRequestException(
          `Order cannot be completed from status ${order.status}.`,
        );
      }

      const existingReference = await attemptRepository.findOne({
        where: {
          paymentProvider: order.paymentProvider,
          providerReference: confirmation.providerReference,
        },
      });

      if (existingReference) {
        throw new ConflictException(
          'This payment reference has already been used.',
        );
      }

      const now = new Date();

      const attempt = attemptRepository.create({
        orderId: order.id,
        paymentProvider: order.paymentProvider,
        status: confirmation.succeeded
          ? CoursePaymentAttemptStatus.SUCCEEDED
          : CoursePaymentAttemptStatus.FAILED,
        providerReference: confirmation.providerReference,
        amount: order.paymentAmount,
        currency: order.paymentCurrency,
        failureCode: confirmation.failureCode,
        failureMessage: confirmation.failureMessage,
        completedAt: now,
      });

      await attemptRepository.save(attempt);

      if (!confirmation.succeeded) {
        order.status = CoursePurchaseStatus.FAILED;

        await orderRepository.save(order);

        return {
          message: 'Payment failed.',
          order: await this.buildOrderResponse(order),
          failure: {
            code: confirmation.failureCode,
            message: confirmation.failureMessage,
          },
        };
      }

      order.status = CoursePurchaseStatus.PAID;
      order.paidAt = now;
      order.refundedAt = null;

      await orderRepository.save(order);

      let enrollment = await enrollmentRepository.findOne({
        where: {
          userId: order.userId,
          courseId: order.courseId,
        },
      });

      if (!enrollment) {
        enrollment = enrollmentRepository.create({
          userId: order.userId,
          courseId: order.courseId,
          orderId: order.id,
          status: CourseEnrollmentStatus.ACTIVE,
          accessType: CourseAccessType.LIFETIME,
          enrolledAt: now,
          expiresAt: null,
          refundedAt: null,
          lastAccessedAt: null,
        });
      } else {
        enrollment.orderId = order.id;

        enrollment.status = CourseEnrollmentStatus.ACTIVE;

        enrollment.accessType = CourseAccessType.LIFETIME;

        enrollment.enrolledAt = now;
        enrollment.expiresAt = null;
        enrollment.refundedAt = null;
      }

      enrollment = await enrollmentRepository.save(enrollment);

      return {
        message: 'Course purchase completed successfully.',
        order: await this.buildOrderResponse(order),
        enrollment: {
          id: enrollment.id,
          courseId: enrollment.courseId,
          status: enrollment.status,
          accessType: enrollment.accessType,
          enrolledAt: enrollment.enrolledAt,
        },
      };
    });
  }

  private async calculateQuote(
    course: Course,
    currency: CommerceCurrency,
    couponCode?: string,
  ): Promise<CalculatedCourseQuote> {
    if (course.isFree) {
      return {
        basePriceEur: zeroMoney(),
        couponCode: null,
        discountPercentage: 0,
        discountAmountEur: zeroMoney(),
        payableAmountEur: zeroMoney(),
        selectedCurrency: currency,
        forexRate: null,
        originalAmount: zeroMoney(),
        discountAmount: zeroMoney(),
        payableAmount: zeroMoney(),
      };
    }

    if (!course.price || !isPositiveMoney(course.price)) {
      throw new BadRequestException(
        'The course EUR price is not configured correctly.',
      );
    }

    const basePriceEur = normalizeMoney(course.price);

    const appliedCoupon = this.resolveCoupon(course, couponCode);

    const calculated = calculatePercentageDiscount({
      baseAmount: basePriceEur,
      percentage: appliedCoupon.percentage,
    });

    if (currency === CommerceCurrency.EUR) {
      return {
        basePriceEur,
        couponCode: appliedCoupon.code,
        discountPercentage: appliedCoupon.percentage,
        discountAmountEur: calculated.discountAmount,
        payableAmountEur: calculated.payableAmount,
        selectedCurrency: CommerceCurrency.EUR,
        forexRate: null,
        originalAmount: calculated.baseAmount,
        discountAmount: calculated.discountAmount,
        payableAmount: calculated.payableAmount,
      };
    }

    const forexRate = await this.forexRateProvider.getEurToBdtRate();

    const originalAmountBdt = convertEurToBdt({
      amountEur: calculated.baseAmount,
      forexRate,
    });

    const payableAmountBdt = convertEurToBdt({
      amountEur: calculated.payableAmount,
      forexRate,
    });

    const discountAmountBdt = subtractMoney(
      originalAmountBdt,
      payableAmountBdt,
    );

    return {
      basePriceEur,
      couponCode: appliedCoupon.code,
      discountPercentage: appliedCoupon.percentage,
      discountAmountEur: calculated.discountAmount,
      payableAmountEur: calculated.payableAmount,
      selectedCurrency: CommerceCurrency.BDT,
      forexRate,
      originalAmount: originalAmountBdt,
      discountAmount: discountAmountBdt,
      payableAmount: payableAmountBdt,
    };
  }

  private resolveCoupon(course: Course, suppliedCouponCode?: string) {
    if (!suppliedCouponCode?.trim()) {
      return {
        code: null,
        percentage: 0,
      };
    }

    const configuredCode = course.couponCode?.trim().toUpperCase();

    const suppliedCode = suppliedCouponCode.trim().toUpperCase();

    if (!configuredCode || suppliedCode !== configuredCode) {
      throw new BadRequestException('Coupon code is invalid for this course.');
    }

    return {
      code: configuredCode,
      percentage: this.parseCouponPercentage(configuredCode),
    };
  }

  private parseCouponPercentage(couponCode: string): number {
    const match = couponCode
      .trim()
      .toUpperCase()
      .match(/(\d{2})$/);

    if (!match) {
      throw new BadRequestException(
        'Configured coupon code must end with a two-digit percentage.',
      );
    }

    const percentage = Number(match[1]);

    if (!Number.isInteger(percentage) || percentage < 1 || percentage > 99) {
      throw new BadRequestException(
        'Coupon percentage must be between 01 and 99.',
      );
    }

    return percentage;
  }

  private async getPublishedCourse(courseId: string): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: {
        id: courseId,
        status: CourseStatus.PUBLISHED,
      },
    });

    if (!course) {
      throw new NotFoundException('Published course not found.');
    }

    return course;
  }

  private async getOwnedOrder(
    userId: string,
    orderId: string,
  ): Promise<CoursePurchaseOrder> {
    const order = await this.purchaseOrderRepository.findOne({
      where: {
        id: orderId,
        userId,
      },
      relations: {
        course: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Purchase order not found.');
    }

    return order;
  }

  private assertConfirmableProvider(
    order: CoursePurchaseOrder,
    provider: CoursePaymentProvider,
  ) {
    if (order.paymentProvider !== provider) {
      throw new BadRequestException(
        `This order was created for ${order.paymentProvider}.`,
      );
    }
  }

  private assertIdempotentOrderMatches(
    order: CoursePurchaseOrder,
    dto: CreateCoursePurchaseOrderDto,
  ) {
    if (
      order.courseId !== dto.courseId ||
      order.paymentCurrency !== dto.currency ||
      order.paymentProvider !== dto.paymentProvider
    ) {
      throw new ConflictException(
        'The idempotency key is already assigned to a different order request.',
      );
    }

    const requestedCoupon = dto.couponCode?.trim().toUpperCase() ?? null;

    if (order.couponCodeSnapshot !== requestedCoupon) {
      throw new ConflictException(
        'The idempotency key is already assigned to a different coupon selection.',
      );
    }
  }

  private async buildOrderResponse(order: CoursePurchaseOrder) {
    const course =
      order.course ??
      (await this.courseRepository.findOne({
        where: {
          id: order.courseId,
        },
      }));

    return {
      ...this.mapOrderResponse(order),
      course: {
        id: order.courseId,
        title: course?.title ?? null,
        subtitle: course?.subtitle ?? null,
      },
    };
  }

  private mapOrderResponse(order: CoursePurchaseOrder) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      course: {
        id: order.courseId,
        title: order.course?.title ?? null,
        subtitle: order.course?.subtitle ?? null,
      },
      pricing: {
        baseCurrency: CommerceCurrency.EUR,
        basePriceEur: order.basePriceEur,
        couponCode: order.couponCodeSnapshot,
        discountPercentage: order.discountPercentage,
        discountAmountEur: order.discountAmountEur,
        payableAmountEur: order.payableAmountEur,
        paymentCurrency: order.paymentCurrency,
        forexRate: order.forexRateSnapshot,
        paymentAmount: order.paymentAmount,
      },
      paymentProvider: order.paymentProvider,
      status: order.status,
      paidAt: order.paidAt,
      refundedAt: order.refundedAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private generateOrderNumber(): string {
    const date = new Date();

    const datePart = [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('');

    const randomPart = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();

    return `IT-SHK-${datePart}-${randomPart}`;
  }
}
