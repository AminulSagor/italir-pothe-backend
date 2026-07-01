import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { Course } from '../../courses/entities/course.entity';
import {
  AdminEnrollmentQueryDto,
  CreateCourseProviderProductDto,
  UpdateCourseProviderProductDto,
} from '../dto/admin-course-commerce.dto';
import { CourseEnrollment } from '../entities/course-enrollment.entity';
import { CourseOrderProviderSnapshot } from '../entities/course-order-provider-snapshot.entity';
import { CourseProviderProduct } from '../entities/course-provider-product.entity';
import { CoursePaymentAttempt } from '../entities/course-payment-attempt.entity';
import { CoursePurchaseOrder } from '../entities/course-purchase-order.entity';
import { DemoPaymentGatewayService } from '../providers/demo-payment-gateway.service';
import {
  CommerceCurrency,
  CommerceSortOrder,
  CourseEnrollmentStatus,
  CoursePaymentAttemptStatus,
  CourseProviderProductType,
  CoursePurchaseStatus,
} from '../types/course-commerce.type';
import { StorePackageProviderProduct } from 'src/package-store/entities/store-package-provider-product.entity';

@Injectable()
export class AdminCourseCommerceService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,

    @InjectRepository(CoursePurchaseOrder)
    private readonly purchaseOrderRepository: Repository<CoursePurchaseOrder>,

    @InjectRepository(CourseEnrollment)
    private readonly enrollmentRepository: Repository<CourseEnrollment>,

    @InjectRepository(CourseProviderProduct)
    private readonly providerProductRepository: Repository<CourseProviderProduct>,

    @InjectRepository(CourseOrderProviderSnapshot)
    private readonly providerSnapshotRepository: Repository<CourseOrderProviderSnapshot>,

    @InjectRepository(StorePackageProviderProduct)
    private readonly storePackageProviderProductRepository: Repository<StorePackageProviderProduct>,

    private readonly dataSource: DataSource,

    private readonly demoPaymentGateway: DemoPaymentGatewayService,
  ) {}

  async createProviderProduct(
    courseId: string,
    dto: CreateCourseProviderProductDto,
  ) {
    await this.getCourse(courseId);

    const productId = dto.productId.trim();
    const productType =
      dto.productType ?? CourseProviderProductType.NON_CONSUMABLE;
    const basePlanId = dto.basePlanId?.trim() || null;
    const offerId = dto.offerId?.trim() || null;

    this.validateProviderProductConfiguration({
      productType,
      basePlanId,
    });

    const mappingId = await this.dataSource.transaction(async (manager) => {
      await this.lockProviderProductIdentity(manager, dto.provider, productId);

      const repository = manager.getRepository(CourseProviderProduct);

      const duplicateCourseProduct = await repository.findOne({
        where: {
          provider: dto.provider,
          productId,
        },
      });

      if (duplicateCourseProduct) {
        throw new ConflictException(
          'This provider product ID is already mapped to another course version.',
        );
      }

      await this.assertProductNotMappedToPackage(
        dto.provider,
        productId,
        manager,
      );

      const isActive = dto.isActive ?? true;

      if (isActive) {
        await repository
          .createQueryBuilder()
          .update(CourseProviderProduct)
          .set({
            isActive: false,
          })
          .where('"courseId" = :courseId', {
            courseId,
          })
          .andWhere('provider = :provider', {
            provider: dto.provider,
          })
          .andWhere('"isActive" = true')
          .execute();
      }

      const saved = await repository.save(
        repository.create({
          courseId,
          provider: dto.provider,
          productId,
          productType,
          basePlanId,
          offerId,
          isActive,
        }),
      );

      return saved.id;
    });

    return this.getProviderProductById(courseId, mappingId);
  }

  async findProviderProducts(courseId: string) {
    await this.getCourse(courseId);

    const items = await this.providerProductRepository.find({
      where: { courseId },
      order: {
        provider: 'ASC',
        isActive: 'DESC',
        createdAt: 'DESC',
      },
    });

    return {
      items: items.map((item) => this.mapProviderProduct(item)),
    };
  }

  async updateProviderProduct(
    courseId: string,
    mappingId: string,
    dto: UpdateCourseProviderProductDto,
  ) {
    await this.getCourse(courseId);
    const current = await this.getProviderProductEntity(courseId, mappingId);

    const productId = dto.productId?.trim() ?? current.productId;
    const productType = dto.productType ?? current.productType;
    const basePlanId =
      dto.basePlanId !== undefined
        ? dto.basePlanId?.trim() || null
        : current.basePlanId;
    const offerId =
      dto.offerId !== undefined ? dto.offerId?.trim() || null : current.offerId;
    const isActive = dto.isActive ?? current.isActive;

    this.validateProviderProductConfiguration({
      productType,
      basePlanId,
    });

    const identityIsChanging =
      productId !== current.productId ||
      productType !== current.productType ||
      basePlanId !== current.basePlanId ||
      offerId !== current.offerId;

    if (identityIsChanging) {
      const referencedOrderCount = await this.providerSnapshotRepository.count({
        where: {
          providerProductId: current.id,
        },
      });

      if (referencedOrderCount > 0) {
        throw new ConflictException(
          'A provider mapping used by an order is immutable. Deactivate it and create a new mapping version.',
        );
      }
    }

    const duplicate = await this.providerProductRepository
      .createQueryBuilder('providerProduct')
      .where('providerProduct.provider = :provider', {
        provider: current.provider,
      })
      .andWhere('providerProduct.productId = :productId', { productId })
      .andWhere('providerProduct.id != :mappingId', { mappingId })
      .getOne();

    if (duplicate) {
      throw new ConflictException(
        'This provider product ID is already mapped to another course version.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await this.lockProviderProductIdentity(
        manager,
        current.provider,
        productId,
      );

      const repository = manager.getRepository(CourseProviderProduct);

      const duplicateCourseProduct = await repository
        .createQueryBuilder('providerProduct')
        .where('providerProduct.provider = :provider', {
          provider: current.provider,
        })
        .andWhere('providerProduct.productId = :productId', {
          productId,
        })
        .andWhere('providerProduct.id != :mappingId', {
          mappingId,
        })
        .getOne();

      if (duplicateCourseProduct) {
        throw new ConflictException(
          'This provider product ID is already mapped to another course version.',
        );
      }

      await this.assertProductNotMappedToPackage(
        current.provider,
        productId,
        manager,
      );

      if (isActive) {
        await repository
          .createQueryBuilder()
          .update(CourseProviderProduct)
          .set({
            isActive: false,
          })
          .where('"courseId" = :courseId', {
            courseId,
          })
          .andWhere('provider = :provider', {
            provider: current.provider,
          })
          .andWhere('id != :mappingId', {
            mappingId,
          })
          .andWhere('"isActive" = true')
          .execute();
      }

      current.productId = productId;
      current.productType = productType;
      current.basePlanId = basePlanId;
      current.offerId = offerId;
      current.isActive = isActive;

      await repository.save(current);
    });

    return this.getProviderProductById(courseId, mappingId);
  }

  async deactivateProviderProduct(courseId: string, mappingId: string) {
    const providerProduct = await this.getProviderProductEntity(
      courseId,
      mappingId,
    );

    providerProduct.isActive = false;
    await this.providerProductRepository.save(providerProduct);

    return {
      message: 'Course provider product mapping deactivated successfully.',
      providerProduct: this.mapProviderProduct(providerProduct),
    };
  }

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

  private validateProviderProductConfiguration(input: {
    productType: CourseProviderProductType;
    basePlanId: string | null;
  }) {
    if (input.productType !== CourseProviderProductType.NON_CONSUMABLE) {
      throw new BadRequestException(
        'Lifetime courses must use non-consumable store products.',
      );
    }

    if (input.basePlanId) {
      throw new BadRequestException(
        'A non-consumable course product cannot have a basePlanId.',
      );
    }
  }

  private async getProviderProductEntity(courseId: string, mappingId: string) {
    const providerProduct = await this.providerProductRepository.findOne({
      where: {
        id: mappingId,
        courseId,
      },
    });

    if (!providerProduct) {
      throw new NotFoundException('Course provider product mapping not found.');
    }

    return providerProduct;
  }

  private async getProviderProductById(courseId: string, mappingId: string) {
    const providerProduct = await this.getProviderProductEntity(
      courseId,
      mappingId,
    );

    return this.mapProviderProduct(providerProduct);
  }

  private mapProviderProduct(providerProduct: CourseProviderProduct) {
    return {
      id: providerProduct.id,
      provider: providerProduct.provider,
      productId: providerProduct.productId,
      productType: providerProduct.productType,
      basePlanId: providerProduct.basePlanId,
      offerId: providerProduct.offerId,
      isActive: providerProduct.isActive,
      createdAt: providerProduct.createdAt,
      updatedAt: providerProduct.updatedAt,
    };
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

  private async lockProviderProductIdentity(
    manager: EntityManager,
    provider: string,
    productId: string,
  ): Promise<void> {
    const lockKey = `billing-product:${provider}:${productId}`;

    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
      lockKey,
    ]);
  }

  private async assertProductNotMappedToPackage(
    provider: string,
    productId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager
      ? manager.getRepository(StorePackageProviderProduct)
      : this.storePackageProviderProductRepository;

    const packageProduct = await repository
      .createQueryBuilder('packageProviderProduct')
      .where('packageProviderProduct.provider = :provider', {
        provider,
      })
      .andWhere('packageProviderProduct.productId = :productId', {
        productId,
      })
      .getOne();

    if (packageProduct) {
      throw new ConflictException(
        'This store product ID is already mapped to an AI, CV, or streak package and cannot be used for a course.',
      );
    }
  }
}
