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
  CoursePaymentProvider,
  CourseProviderProductType,
  CourseProviderVerificationStatus,
  CoursePurchaseStatus,
} from '../types/course-commerce.type';
import { StorePackageProviderProduct } from 'src/package-store/entities/store-package-provider-product.entity';
import { ProviderRefundOperation } from 'src/billing/entities/provider-refund-operation.entity';
import { GooglePlayBillingService } from 'src/billing/google-play/google-play-billing.service';
import {
  BillingOrderDomain,
  BillingPaymentProvider,
  ProviderRefundSource,
  ProviderRefundStatus,
} from 'src/billing/types/provider-refund.type';
import { CourseOrderProviderTransaction } from '../entities/course-order-provider-transaction.entity';

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

    @InjectRepository(ProviderRefundOperation)
    private readonly refundOperationRepository: Repository<ProviderRefundOperation>,

    private readonly googlePlayBillingService: GooglePlayBillingService,
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

    const revenueResult = await this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .innerJoin('enrollment.order', 'purchaseOrder')
      .select('COALESCE(SUM(purchaseOrder.payableAmountEur), 0)', 'total')
      .where('enrollment.courseId = :courseId', { courseId })
      .andWhere('enrollment.status = :enrollmentStatus', {
        enrollmentStatus: CourseEnrollmentStatus.ACTIVE,
      })
      .andWhere(
        `(
        purchaseOrder.status = :paidStatus
        OR purchaseOrder.paidAt IS NOT NULL
      )`,
        {
          paidStatus: CoursePurchaseStatus.PAID,
        },
      )
      .andWhere(
        'COALESCE(purchaseOrder.paidAt, enrollment.enrolledAt) >= :startOfYear',
        {
          startOfYear,
        },
      )
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
      .leftJoinAndSelect('purchaseOrder.providerSnapshot', 'providerSnapshot')
      .leftJoinAndSelect(
        'purchaseOrder.providerTransaction',
        'providerTransaction',
      )
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
              paidAt: enrollment.order.paidAt,
              refundedAt: enrollment.order.refundedAt,
              billing: {
                provider: enrollment.order.providerSnapshot?.provider ?? null,
                productId: enrollment.order.providerSnapshot?.productId ?? null,
                productType:
                  enrollment.order.providerSnapshot?.productType ?? null,
                basePlanId:
                  enrollment.order.providerSnapshot?.basePlanId ?? null,
                offerId: enrollment.order.providerSnapshot?.offerId ?? null,
                environment:
                  enrollment.order.providerTransaction?.environment ?? null,
                verificationStatus:
                  enrollment.order.providerTransaction?.verificationStatus ??
                  null,
                providerTransactionId:
                  enrollment.order.providerTransaction?.providerTransactionId ??
                  null,
                tokenHash:
                  enrollment.order.providerTransaction?.tokenHash ?? null,
                verifiedAt:
                  enrollment.order.providerTransaction?.verifiedAt ?? null,
              },
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
        order: {
          providerSnapshot: true,
          providerTransaction: true,
        },
      },
    });

    if (!enrollment) {
      throw new NotFoundException('Course enrollment not found.');
    }

    const refundOperation = enrollment.order
      ? await this.refundOperationRepository.findOne({
          where: {
            orderDomain: BillingOrderDomain.COURSE,
            internalOrderId: enrollment.order.id,

            provider:
              enrollment.order.paymentProvider ===
              CoursePaymentProvider.GOOGLE_PLAY
                ? BillingPaymentProvider.GOOGLE_PLAY
                : BillingPaymentProvider.APP_STORE,
          },
        })
      : null;

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

            providerSnapshot: enrollment.order.providerSnapshot
              ? {
                  id: enrollment.order.providerSnapshot.id,
                  providerProductId:
                    enrollment.order.providerSnapshot.providerProductId,
                  provider: enrollment.order.providerSnapshot.provider,
                  productId: enrollment.order.providerSnapshot.productId,
                  productType: enrollment.order.providerSnapshot.productType,
                  basePlanId: enrollment.order.providerSnapshot.basePlanId,
                  offerId: enrollment.order.providerSnapshot.offerId,
                  createdAt: enrollment.order.providerSnapshot.createdAt,
                }
              : null,

            providerTransaction: enrollment.order.providerTransaction
              ? {
                  id: enrollment.order.providerTransaction.id,
                  provider: enrollment.order.providerTransaction.provider,
                  productId: enrollment.order.providerTransaction.productId,
                  tokenHash: enrollment.order.providerTransaction.tokenHash,
                  providerTransactionId:
                    enrollment.order.providerTransaction.providerTransactionId,
                  environment: enrollment.order.providerTransaction.environment,
                  verificationStatus:
                    enrollment.order.providerTransaction.verificationStatus,
                  verifiedAt: enrollment.order.providerTransaction.verifiedAt,
                  createdAt: enrollment.order.providerTransaction.createdAt,
                  updatedAt: enrollment.order.providerTransaction.updatedAt,
                }
              : null,

            refundOperation: refundOperation
              ? {
                  id: refundOperation.id,
                  provider: refundOperation.provider,
                  providerOrderId: refundOperation.providerOrderId,
                  status: refundOperation.status,
                  source: refundOperation.source,
                  revoke: refundOperation.revoke,
                  reason: refundOperation.reason,
                  providerCompletedAt: refundOperation.providerCompletedAt,
                  completedAt: refundOperation.completedAt,
                  failureCode: refundOperation.failureCode,
                  failureMessage: refundOperation.failureMessage,
                  createdAt: refundOperation.createdAt,
                  updatedAt: refundOperation.updatedAt,
                }
              : null,
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

  async refundGooglePlayOrder(params: {
    orderId: string;
    adminUserId: string;
    reason?: string;
  }) {
    if (!this.googlePlayBillingService.isRealVerificationEnabled()) {
      throw new BadRequestException(
        'Real Google Play verification must be enabled before issuing a real refund.',
      );
    }

    const prepared = await this.prepareCourseRefundOperation({
      orderId: params.orderId,
      adminUserId: params.adminUserId,
      reason: params.reason,
    });

    if (prepared.operation.status === ProviderRefundStatus.COMPLETED) {
      return this.getCourseRefundResult(params.orderId, prepared.operation);
    }

    if (prepared.shouldCallProvider) {
      try {
        await this.googlePlayBillingService.refundOrder({
          orderId: prepared.operation.providerOrderId,
          revoke: true,
        });

        await this.markCourseRefundProviderCompleted(prepared.operation.id);
      } catch (error) {
        await this.markCourseRefundFailure({
          operationId: prepared.operation.id,
          error,
          preserveProviderCompleted: false,
        });

        throw error;
      }
    }

    try {
      return await this.applyCourseRefundLocally({
        orderId: params.orderId,
        operationId: prepared.operation.id,
      });
    } catch (error) {
      await this.markCourseRefundFailure({
        operationId: prepared.operation.id,
        error,
        preserveProviderCompleted: true,
      });

      throw error;
    }
  }

  private async prepareCourseRefundOperation(params: {
    orderId: string;
    adminUserId: string;
    reason?: string;
  }): Promise<{
    operation: ProviderRefundOperation;
    shouldCallProvider: boolean;
  }> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
        [`course-refund:${params.orderId}`],
      );

      const orderRepository = manager.getRepository(CoursePurchaseOrder);

      const transactionRepository = manager.getRepository(
        CourseOrderProviderTransaction,
      );

      const operationRepository = manager.getRepository(
        ProviderRefundOperation,
      );

      const order = await orderRepository
        .createQueryBuilder('purchaseOrder')
        .setLock('pessimistic_write')
        .where('purchaseOrder.id = :orderId', {
          orderId: params.orderId,
        })
        .getOne();

      if (!order) {
        throw new NotFoundException('Purchase order not found.');
      }

      if (order.paymentProvider !== CoursePaymentProvider.GOOGLE_PLAY) {
        throw new BadRequestException(
          'Only Google Play course orders can use this refund endpoint.',
        );
      }

      const providerTransaction = await transactionRepository.findOne({
        where: {
          orderId: order.id,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!providerTransaction) {
        throw new ConflictException(
          'The course order is missing its provider transaction.',
        );
      }

      if (
        providerTransaction.provider !== CoursePaymentProvider.GOOGLE_PLAY ||
        providerTransaction.verificationStatus !==
          CourseProviderVerificationStatus.VERIFIED
      ) {
        throw new BadRequestException(
          'The Google Play transaction has not been verified.',
        );
      }

      const providerOrderId = providerTransaction.providerTransactionId?.trim();

      if (!providerOrderId || providerOrderId.startsWith('google-play:')) {
        throw new ConflictException(
          'The verified transaction does not contain a refundable Google Play order ID.',
        );
      }

      let operation = await operationRepository.findOne({
        where: {
          orderDomain: BillingOrderDomain.COURSE,
          internalOrderId: order.id,
          provider: BillingPaymentProvider.GOOGLE_PLAY,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (order.status === CoursePurchaseStatus.REFUNDED) {
        if (operation?.status === ProviderRefundStatus.COMPLETED) {
          return {
            operation,
            shouldCallProvider: false,
          };
        }

        throw new ConflictException(
          'The course order was already refunded outside this refund operation.',
        );
      }

      if (order.status !== CoursePurchaseStatus.PAID) {
        throw new BadRequestException(
          'Only a paid course order can be refunded.',
        );
      }

      if (!operation) {
        operation = operationRepository.create({
          orderDomain: BillingOrderDomain.COURSE,
          internalOrderId: order.id,
          provider: BillingPaymentProvider.GOOGLE_PLAY,
          providerOrderId,
          status: ProviderRefundStatus.PROCESSING,
          source: ProviderRefundSource.ADMIN,
          revoke: true,
          reason: params.reason?.trim() || null,
          requestedByAdminId: params.adminUserId,
          providerCompletedAt: null,
          completedAt: null,
          failureCode: null,
          failureMessage: null,
        });

        operation = await operationRepository.save(operation);

        return {
          operation,
          shouldCallProvider: true,
        };
      }

      if (operation.providerOrderId !== providerOrderId) {
        throw new ConflictException(
          'The stored refund operation references another Google Play order.',
        );
      }

      if (operation.status === ProviderRefundStatus.COMPLETED) {
        return {
          operation,
          shouldCallProvider: false,
        };
      }

      if (operation.status === ProviderRefundStatus.PROVIDER_COMPLETED) {
        return {
          operation,
          shouldCallProvider: false,
        };
      }

      if (operation.status === ProviderRefundStatus.PROCESSING) {
        throw new ConflictException(
          'A refund request for this course order is already processing.',
        );
      }

      operation.status = ProviderRefundStatus.PROCESSING;
      operation.reason = params.reason?.trim() || operation.reason;
      operation.requestedByAdminId = params.adminUserId;
      operation.failureCode = null;
      operation.failureMessage = null;

      operation = await operationRepository.save(operation);

      return {
        operation,
        shouldCallProvider: true,
      };
    });
  }

  private async markCourseRefundProviderCompleted(
    operationId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProviderRefundOperation);

      const operation = await repository.findOne({
        where: {
          id: operationId,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!operation) {
        throw new NotFoundException('Refund operation not found.');
      }

      if (operation.status === ProviderRefundStatus.COMPLETED) {
        return;
      }

      operation.status = ProviderRefundStatus.PROVIDER_COMPLETED;

      operation.providerCompletedAt = new Date();
      operation.failureCode = null;
      operation.failureMessage = null;

      await repository.save(operation);
    });
  }

  private async applyCourseRefundLocally(params: {
    orderId: string;
    operationId: string;
  }) {
    return this.dataSource.transaction(async (manager) => {
      const orderRepository = manager.getRepository(CoursePurchaseOrder);

      const enrollmentRepository = manager.getRepository(CourseEnrollment);

      const attemptRepository = manager.getRepository(CoursePaymentAttempt);

      const operationRepository = manager.getRepository(
        ProviderRefundOperation,
      );

      const operation = await operationRepository.findOne({
        where: {
          id: params.operationId,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!operation) {
        throw new NotFoundException('Refund operation not found.');
      }

      if (
        operation.status !== ProviderRefundStatus.PROVIDER_COMPLETED &&
        operation.status !== ProviderRefundStatus.COMPLETED
      ) {
        throw new ConflictException(
          'Google Play has not completed the refund.',
        );
      }

      const order = await orderRepository
        .createQueryBuilder('purchaseOrder')
        .setLock('pessimistic_write')
        .where('purchaseOrder.id = :orderId', {
          orderId: params.orderId,
        })
        .getOne();

      if (!order) {
        throw new NotFoundException('Purchase order not found.');
      }

      const now = new Date();

      const enrollment = await enrollmentRepository.findOne({
        where: {
          userId: order.userId,
          courseId: order.courseId,
          orderId: order.id,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (order.status !== CoursePurchaseStatus.REFUNDED) {
        if (order.status !== CoursePurchaseStatus.PAID) {
          throw new BadRequestException(
            'Only a paid course order can be refunded.',
          );
        }

        order.status = CoursePurchaseStatus.REFUNDED;
        order.refundedAt = now;

        await orderRepository.save(order);

        /*
         * Only revoke the enrollment if the refunded order is still
         * the enrollment's current order. This preserves a later
         * repurchase of the same course.
         */
        if (enrollment) {
          enrollment.status = CourseEnrollmentStatus.REFUNDED;

          enrollment.refundedAt = now;

          await enrollmentRepository.save(enrollment);
        }

        const refundReference = `refund:${operation.providerOrderId}`;

        const existingAttempt = await attemptRepository.findOne({
          where: {
            paymentProvider: CoursePaymentProvider.GOOGLE_PLAY,

            providerReference: refundReference,
          },
        });

        if (!existingAttempt) {
          await attemptRepository.save(
            attemptRepository.create({
              orderId: order.id,

              paymentProvider: CoursePaymentProvider.GOOGLE_PLAY,

              status: CoursePaymentAttemptStatus.REFUNDED,

              providerReference: refundReference,

              amount: order.paymentAmount,
              currency: order.paymentCurrency,

              failureCode: null,
              failureMessage: null,
              completedAt: now,
            }),
          );
        }
      }

      operation.status = ProviderRefundStatus.COMPLETED;
      operation.completedAt = operation.completedAt ?? now;

      operation.failureCode = null;
      operation.failureMessage = null;

      await operationRepository.save(operation);

      return {
        message: 'Google Play course refund completed successfully.',

        refundOperationId: operation.id,
        providerOrderId: operation.providerOrderId,

        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,

        enrollmentStatus: enrollment?.status ?? null,

        refundedAt: order.refundedAt,
      };
    });
  }

  async applyGooglePlayVoidedPurchase(params: {
    internalOrderId: string;
    providerOrderId: string;
    purchaseTokenHash: string;
    eventTime: Date;
  }) {
    const operation = await this.dataSource.transaction(async (manager) => {
      const orderRepository = manager.getRepository(CoursePurchaseOrder);

      const transactionRepository = manager.getRepository(
        CourseOrderProviderTransaction,
      );

      const operationRepository = manager.getRepository(
        ProviderRefundOperation,
      );

      const order = await orderRepository
        .createQueryBuilder('purchaseOrder')
        .setLock('pessimistic_write')
        .where('purchaseOrder.id = :orderId', {
          orderId: params.internalOrderId,
        })
        .getOne();

      if (!order) {
        throw new NotFoundException('Course purchase order not found.');
      }

      if (order.paymentProvider !== CoursePaymentProvider.GOOGLE_PLAY) {
        throw new BadRequestException(
          'The course order is not a Google Play order.',
        );
      }

      const providerTransaction = await transactionRepository.findOne({
        where: {
          orderId: order.id,
        },

        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!providerTransaction) {
        throw new ConflictException('Course provider transaction not found.');
      }

      const tokenMatches =
        providerTransaction.tokenHash === params.purchaseTokenHash;

      const orderMatches =
        providerTransaction.providerTransactionId === params.providerOrderId;

      if (!tokenMatches && !orderMatches) {
        throw new ConflictException(
          'Voided purchase does not match the course order.',
        );
      }

      let operation = await operationRepository.findOne({
        where: {
          orderDomain: BillingOrderDomain.COURSE,

          internalOrderId: order.id,

          provider: BillingPaymentProvider.GOOGLE_PLAY,
        },

        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!operation) {
        operation = operationRepository.create({
          orderDomain: BillingOrderDomain.COURSE,

          internalOrderId: order.id,

          provider: BillingPaymentProvider.GOOGLE_PLAY,

          providerOrderId: params.providerOrderId,

          status: ProviderRefundStatus.PROVIDER_COMPLETED,

          source: ProviderRefundSource.GOOGLE_RTDN,

          revoke: true,

          reason: 'Google Play voided the purchase.',

          requestedByAdminId: null,

          providerCompletedAt: params.eventTime,

          completedAt: null,

          failureCode: null,

          failureMessage: null,
        });
      } else if (operation.status !== ProviderRefundStatus.COMPLETED) {
        operation.status = ProviderRefundStatus.PROVIDER_COMPLETED;

        operation.source = ProviderRefundSource.GOOGLE_RTDN;

        operation.revoke = true;

        operation.providerCompletedAt =
          operation.providerCompletedAt ?? params.eventTime;

        operation.failureCode = null;

        operation.failureMessage = null;
      }

      return operationRepository.save(operation);
    });

    if (operation.status === ProviderRefundStatus.COMPLETED) {
      return this.getCourseRefundResult(params.internalOrderId, operation);
    }

    return this.applyCourseRefundLocally({
      orderId: params.internalOrderId,

      operationId: operation.id,
    });
  }

  private async getCourseRefundResult(
    orderId: string,
    operation: ProviderRefundOperation,
  ) {
    const [order, enrollment] = await Promise.all([
      this.purchaseOrderRepository.findOne({
        where: {
          id: orderId,
        },
      }),

      this.enrollmentRepository.findOne({
        where: {
          orderId,
        },
      }),
    ]);

    if (!order) {
      throw new NotFoundException('Purchase order not found.');
    }

    return {
      message: 'Google Play course refund was already completed.',

      refundOperationId: operation.id,
      providerOrderId: operation.providerOrderId,

      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,

      enrollmentStatus: enrollment?.status ?? null,

      refundedAt: order.refundedAt,
    };
  }

  private async markCourseRefundFailure(params: {
    operationId: string;
    error: unknown;
    preserveProviderCompleted: boolean;
  }): Promise<void> {
    const normalized = this.normalizeRefundError(params.error);

    await this.refundOperationRepository.update(
      {
        id: params.operationId,
      },
      {
        status: params.preserveProviderCompleted
          ? ProviderRefundStatus.PROVIDER_COMPLETED
          : ProviderRefundStatus.FAILED,

        failureCode: normalized.code,
        failureMessage: normalized.message,
      },
    );
  }

  private normalizeRefundError(error: unknown): {
    code: string;
    message: string;
  } {
    if (error instanceof Error) {
      return {
        code: error.name.slice(0, 80),
        message: error.message.slice(0, 500),
      };
    }

    return {
      code: 'UNKNOWN_REFUND_ERROR',
      message: 'Unknown refund error.',
    };
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
