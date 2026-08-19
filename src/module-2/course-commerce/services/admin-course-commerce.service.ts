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
  CreateCourseManualAccessOptionDto,
  GrantExternalCourseAccessDto,
  UpdateCourseManualAccessOptionDto,
  UpdateCourseProviderProductDto,
} from '../dto/admin-course-commerce.dto';
import {
  AdminCourseAccessGrant,
  AdminCourseAccessGrantStatus,
} from '../entities/admin-course-access-grant.entity';
import { CourseEnrollment } from '../entities/course-enrollment.entity';
import { CourseOrderProviderSnapshot } from '../entities/course-order-provider-snapshot.entity';
import { CourseProviderProduct } from '../entities/course-provider-product.entity';
import { CourseManualAccessOption } from '../entities/course-manual-access-option.entity';
import { CoursePaymentAttempt } from '../entities/course-payment-attempt.entity';
import { CoursePurchaseOrder } from '../entities/course-purchase-order.entity';
import { DemoPaymentGatewayService } from '../providers/demo-payment-gateway.service';
import {
  ADMIN_EXTERNAL_PAYMENT_PROVIDER,
  CommerceCurrency,
  CommerceSortOrder,
  CourseAccessType,
  CourseEnrollmentStatus,
  CoursePaymentAttemptStatus,
  CoursePaymentProvider,
  CourseProviderProductType,
  CourseProviderVerificationStatus,
  CoursePurchaseStatus,
} from '../types/course-commerce.type';
import { User, UserRole } from 'src/users/entities/user.entity';
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

    @InjectRepository(AdminCourseAccessGrant)
    private readonly externalGrantRepository: Repository<AdminCourseAccessGrant>,

    @InjectRepository(CourseProviderProduct)
    private readonly providerProductRepository: Repository<CourseProviderProduct>,

    @InjectRepository(CourseManualAccessOption)
    private readonly manualAccessOptionRepository: Repository<CourseManualAccessOption>,

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
    const accessType = dto.accessType ?? CourseAccessType.LIFETIME;
    const durationDays = dto.durationDays ?? null;
    const basePlanId = dto.basePlanId?.trim() || null;
    const offerId = dto.offerId?.trim() || null;

    this.validateProviderProductConfiguration({
      provider: dto.provider,
      productType,
      accessType,
      durationDays,
      basePlanId,
    });

    const mappingId = await this.dataSource.transaction(async (manager) => {
      await this.lockProviderProductIdentity(manager, dto.provider, productId);

      const repository = manager.getRepository(CourseProviderProduct);

      const duplicateCourseProduct = await this.findDuplicateProviderProduct({
        repository,
        provider: dto.provider,
        productId,
        basePlanId,
      });

      if (duplicateCourseProduct) {
        throw new ConflictException(
          'This provider product ID is already mapped to another course version.',
        );
      }

      await this.assertProviderProductFamilyMatches({
        repository,
        provider: dto.provider,
        productId,
        productType,
      });
      await this.assertCourseDurationAvailable({
        repository,
        courseId,
        provider: dto.provider,
        accessType,
        durationDays,
      });

      await this.assertProductNotMappedToPackage(
        dto.provider,
        productId,
        manager,
      );

      const isActive = dto.isActive ?? true;

      const saved = await repository.save(
        repository.create({
          courseId,
          provider: dto.provider,
          productId,
          productType,
          accessType,
          durationDays,
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
    const accessType = dto.accessType ?? current.accessType;
    const durationDays =
      dto.durationDays !== undefined ? dto.durationDays : current.durationDays;
    const basePlanId =
      dto.basePlanId !== undefined
        ? dto.basePlanId?.trim() || null
        : current.basePlanId;
    const offerId =
      dto.offerId !== undefined ? dto.offerId?.trim() || null : current.offerId;
    const isActive = dto.isActive ?? current.isActive;

    this.validateProviderProductConfiguration({
      provider: current.provider,
      productType,
      accessType,
      durationDays,
      basePlanId,
    });

    const identityIsChanging =
      productId !== current.productId ||
      productType !== current.productType ||
      accessType !== current.accessType ||
      durationDays !== current.durationDays ||
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

    const duplicate = await this.findDuplicateProviderProduct({
      repository: this.providerProductRepository,
      provider: current.provider,
      productId,
      basePlanId,
      excludeId: mappingId,
    });

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

      const duplicateCourseProduct = await this.findDuplicateProviderProduct({
        repository,
        provider: current.provider,
        productId,
        basePlanId,
        excludeId: mappingId,
      });

      if (duplicateCourseProduct) {
        throw new ConflictException(
          'This provider product ID is already mapped to another course version.',
        );
      }

      await this.assertProviderProductFamilyMatches({
        repository,
        provider: current.provider,
        productId,
        productType,
        excludeId: mappingId,
      });
      await this.assertCourseDurationAvailable({
        repository,
        courseId,
        provider: current.provider,
        accessType,
        durationDays,
        excludeId: mappingId,
      });

      await this.assertProductNotMappedToPackage(
        current.provider,
        productId,
        manager,
      );

      current.productId = productId;
      current.productType = productType;
      current.accessType = accessType;
      current.durationDays = durationDays;
      current.basePlanId = basePlanId;
      current.offerId = offerId;
      current.isActive = isActive;

      await repository.save(current);
    });

    return this.getProviderProductById(courseId, mappingId);
  }

  async deleteProviderProduct(courseId: string, mappingId: string) {
    const providerProduct = await this.getProviderProductEntity(
      courseId,
      mappingId,
    );

    const referencedOrderCount = await this.providerSnapshotRepository.count({
      where: {
        providerProductId: providerProduct.id,
      },
    });

    if (referencedOrderCount > 0) {
      throw new ConflictException(
        'This course provider product mapping is already used by an order. Deactivate it instead of deleting it.',
      );
    }

    await this.providerProductRepository.delete({
      id: providerProduct.id,
      courseId,
    });

    return {
      message: 'Course provider product mapping deleted successfully.',
      providerProductId: mappingId,
    };
  }

  async findManualAccessOptions(courseId: string) {
    await this.getCourse(courseId);

    const items = await this.manualAccessOptionRepository.find({
      where: { courseId },
      order: { accessType: 'ASC', durationDays: 'ASC', createdAt: 'ASC' },
    });

    return { items: items.map((item) => this.mapManualAccessOption(item)) };
  }

  async createManualAccessOption(
    courseId: string,
    dto: CreateCourseManualAccessOptionDto,
  ) {
    await this.getCourse(courseId);
    const durationDays = this.normalizeDuration(
      dto.accessType,
      dto.durationDays,
    );

    const id = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
        [`course-manual-access:${courseId}`],
      );
      const repository = manager.getRepository(CourseManualAccessOption);
      const duplicate = await this.findManualOption(
        repository,
        courseId,
        dto.accessType,
        durationDays,
      );
      if (duplicate) {
        throw new ConflictException(
          'This manual course-access option is already configured.',
        );
      }

      const saved = await repository.save(
        repository.create({
          courseId,
          accessType: dto.accessType,
          durationDays,
          isActive: dto.isActive ?? true,
        }),
      );
      return saved.id;
    });

    return this.mapManualAccessOption(
      await this.getManualAccessOptionEntity(courseId, id),
    );
  }

  async updateManualAccessOption(
    courseId: string,
    optionId: string,
    dto: UpdateCourseManualAccessOptionDto,
  ) {
    await this.getCourse(courseId);
    const current = await this.getManualAccessOptionEntity(courseId, optionId);
    const accessType = dto.accessType ?? current.accessType;
    const durationDays = this.normalizeDuration(
      accessType,
      dto.durationDays !== undefined ? dto.durationDays : current.durationDays,
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
        [`course-manual-access:${courseId}`],
      );
      const repository = manager.getRepository(CourseManualAccessOption);
      const duplicate = await this.findManualOption(
        repository,
        courseId,
        accessType,
        durationDays,
        optionId,
      );
      if (duplicate) {
        throw new ConflictException(
          'This manual course-access option is already configured.',
        );
      }

      current.accessType = accessType;
      current.durationDays = durationDays;
      current.isActive = dto.isActive ?? current.isActive;
      await repository.save(current);
    });

    return this.mapManualAccessOption(
      await this.getManualAccessOptionEntity(courseId, optionId),
    );
  }

  async deleteManualAccessOption(courseId: string, optionId: string) {
    const option = await this.getManualAccessOptionEntity(courseId, optionId);
    const usedQuery = this.externalGrantRepository
      .createQueryBuilder('grant')
      .where('grant.courseId = :courseId', { courseId })
      .andWhere('grant.accessType = :accessType', {
        accessType: option.accessType,
      });
    if (option.durationDays === null) {
      usedQuery.andWhere('grant.durationDays IS NULL');
    } else {
      usedQuery.andWhere('grant.durationDays = :durationDays', {
        durationDays: option.durationDays,
      });
    }
    const used = await usedQuery.getCount();
    if (used > 0) {
      throw new ConflictException(
        'This manual access option has grant history. Deactivate it instead of deleting it.',
      );
    }

    await this.manualAccessOptionRepository.delete({ id: optionId, courseId });
    return { message: 'Manual course-access option deleted successfully.' };
  }

  async grantExternalCourseAccess(params: {
    courseId: string;
    adminUserId: string;
    dto: GrantExternalCourseAccessDto;
  }) {
    const paymentAmount = this.normalizeMoney(
      params.dto.paymentAmount,
      'paymentAmount',
    );
    const amountEur = this.normalizeMoney(params.dto.amountEur, 'amountEur');

    if (
      params.dto.paymentCurrency === CommerceCurrency.EUR &&
      paymentAmount !== amountEur
    ) {
      throw new BadRequestException(
        'For EUR payments, amountEur must equal paymentAmount.',
      );
    }

    const externalReference = params.dto.externalReference.trim();
    const paidAt = params.dto.paidAt ? new Date(params.dto.paidAt) : new Date();

    if (paidAt.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new BadRequestException('paidAt cannot be in the future.');
    }

    const result = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
        [`external-course-access:${params.courseId}:${params.dto.userId}`],
      );
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
        [`external-course-reference:${externalReference}`],
      );

      const course = await manager.getRepository(Course).findOne({
        where: { id: params.courseId },
      });
      if (!course) throw new NotFoundException('Course not found.');

      const user = await manager.getRepository(User).findOne({
        where: { id: params.dto.userId, role: UserRole.USER },
      });
      if (!user) throw new NotFoundException('User not found.');

      const manualOptionRepository = manager.getRepository(
        CourseManualAccessOption,
      );
      const manualOption = params.dto.manualAccessOptionId
        ? await manualOptionRepository.findOne({
            where: {
              id: params.dto.manualAccessOptionId,
              courseId: course.id,
              isActive: true,
            },
          })
        : await manualOptionRepository.findOne({
            where: {
              courseId: course.id,
              accessType: CourseAccessType.LIFETIME,
              isActive: true,
            },
          });

      if (!manualOption) {
        throw new BadRequestException(
          params.dto.manualAccessOptionId
            ? 'The selected manual course-access option is unavailable.'
            : 'Lifetime manual access is not enabled for this course.',
        );
      }

      const accessType = manualOption.accessType;
      const durationDays = manualOption.durationDays;

      const grantRepository = manager.getRepository(AdminCourseAccessGrant);
      const duplicateReference = await grantRepository.findOne({
        where: { externalReference },
      });
      if (duplicateReference) {
        throw new ConflictException(
          'This external payment reference has already been recorded.',
        );
      }

      const existingActiveGrant = await grantRepository.findOne({
        where: {
          userId: user.id,
          courseId: course.id,
          status: AdminCourseAccessGrantStatus.ACTIVE,
        },
      });
      const activeStoreOrder = await manager
        .getRepository(CoursePurchaseOrder)
        .findOne({
          where: {
            userId: user.id,
            courseId: course.id,
            status: CoursePurchaseStatus.PAID,
          },
        });
      if (activeStoreOrder) {
        throw new ConflictException(
          'This user already has a paid store order for the course.',
        );
      }

      const enrollmentRepository = manager.getRepository(CourseEnrollment);
      let enrollment = await enrollmentRepository.findOne({
        where: { userId: user.id, courseId: course.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (
        enrollment?.status === CourseEnrollmentStatus.ACTIVE &&
        enrollment.orderId
      ) {
        throw new ConflictException(
          'This user already has active store access to the course.',
        );
      }

      if (
        enrollment?.status === CourseEnrollmentStatus.ACTIVE &&
        enrollment.accessType === CourseAccessType.LIFETIME
      ) {
        throw new ConflictException(
          'This user already has lifetime access to the course.',
        );
      }

      if (existingActiveGrant) {
        existingActiveGrant.status = AdminCourseAccessGrantStatus.REVOKED;
        existingActiveGrant.revokedAt = new Date();
        existingActiveGrant.revokedByAdminId = params.adminUserId;
        existingActiveGrant.revokeReason =
          'Superseded by a new external access grant.';
        await grantRepository.save(existingActiveGrant);
      }

      const now = new Date();
      const expiresAt =
        accessType === CourseAccessType.TIME_LIMITED && durationDays
          ? this.addDays(
              new Date(
                Math.max(
                  now.getTime(),
                  paidAt.getTime(),
                  enrollment?.expiresAt?.getTime() ?? 0,
                ),
              ),
              durationDays,
            )
          : null;

      if (!enrollment) {
        enrollment = enrollmentRepository.create({
          userId: user.id,
          courseId: course.id,
          orderId: null,
          status: CourseEnrollmentStatus.ACTIVE,
          accessType,
          enrolledAt: paidAt,
          expiresAt,
          refundedAt: null,
          lastAccessedAt: null,
        });
      } else {
        enrollment.orderId = null;
        enrollment.status = CourseEnrollmentStatus.ACTIVE;
        enrollment.accessType = accessType;
        enrollment.enrolledAt = enrollment.enrolledAt ?? paidAt;
        enrollment.expiresAt = expiresAt;
        enrollment.refundedAt = null;
      }

      enrollment = await enrollmentRepository.save(enrollment);

      const grant = await grantRepository.save(
        grantRepository.create({
          userId: user.id,
          courseId: course.id,
          enrollmentId: enrollment.id,
          paymentAmount,
          paymentCurrency: params.dto.paymentCurrency,
          amountEur,
          accessType,
          durationDays,
          expiresAt,
          paymentMethod: params.dto.paymentMethod,
          externalReference,
          paidAt,
          notes: params.dto.notes?.trim() || null,
          status: AdminCourseAccessGrantStatus.ACTIVE,
          grantedByAdminId: params.adminUserId,
          revokedAt: null,
          revokedByAdminId: null,
          revokeReason: null,
        }),
      );

      return { grant, enrollment };
    });

    return {
      message: 'External course access granted successfully.',
      enrollmentId: result.enrollment.id,
      grant: this.mapExternalGrant(result.grant),
    };
  }

  async revokeExternalCourseAccess(params: {
    grantId: string;
    adminUserId: string;
    reason: string;
  }) {
    const result = await this.dataSource.transaction(async (manager) => {
      const grantRepository = manager.getRepository(AdminCourseAccessGrant);
      const grant = await grantRepository.findOne({
        where: { id: params.grantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!grant) {
        throw new NotFoundException('External course access grant not found.');
      }

      if (grant.status === AdminCourseAccessGrantStatus.REVOKED) {
        return { grant, enrollmentRevoked: false, alreadyRevoked: true };
      }

      const enrollmentRepository = manager.getRepository(CourseEnrollment);
      const enrollment = await enrollmentRepository.findOne({
        where: { id: grant.enrollmentId },
        lock: { mode: 'pessimistic_write' },
      });

      const now = new Date();
      grant.status = AdminCourseAccessGrantStatus.REVOKED;
      grant.revokedAt = now;
      grant.revokedByAdminId = params.adminUserId;
      grant.revokeReason = params.reason.trim();
      await grantRepository.save(grant);

      let enrollmentRevoked = false;
      if (
        enrollment &&
        enrollment.orderId === null &&
        enrollment.status === CourseEnrollmentStatus.ACTIVE
      ) {
        enrollment.status = CourseEnrollmentStatus.REVOKED;
        await enrollmentRepository.save(enrollment);
        enrollmentRevoked = true;
      }

      return { grant, enrollmentRevoked, alreadyRevoked: false };
    });

    return {
      message: result.alreadyRevoked
        ? 'External course access was already revoked.'
        : 'External course access revoked successfully.',
      enrollmentRevoked: result.enrollmentRevoked,
      grant: this.mapExternalGrant(result.grant),
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

    const externalRevenueResult = await this.externalGrantRepository
      .createQueryBuilder('externalGrant')
      .select('COALESCE(SUM(externalGrant.amountEur), 0)', 'total')
      .where('externalGrant.courseId = :courseId', { courseId })
      .andWhere('externalGrant.paidAt >= :startOfYear', { startOfYear })
      .getRawOne<{ total: string }>();

    const totalRevenueEur = (
      Number(revenueResult?.total ?? 0) +
      Number(externalRevenueResult?.total ?? 0)
    ).toFixed(2);

    return {
      courseId,
      totalStudents,
      activeNow,
      revenueYtd: {
        currency: CommerceCurrency.EUR,
        amount: totalRevenueEur,
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
      .leftJoinAndSelect(
        'enrollment.externalGrants',
        'externalGrant',
        `externalGrant.id = (
          SELECT latest."id"
          FROM "admin_course_access_grants" latest
          WHERE latest."enrollmentId" = enrollment."id"
          ORDER BY latest."createdAt" DESC
          LIMIT 1
        )`,
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
      if (query.paymentProvider === ADMIN_EXTERNAL_PAYMENT_PROVIDER) {
        queryBuilder.andWhere('externalGrant.id IS NOT NULL');
      } else {
        queryBuilder.andWhere(
          'purchaseOrder.paymentProvider = :paymentProvider',
          {
            paymentProvider: query.paymentProvider,
          },
        );
      }
    }

    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;

      queryBuilder.andWhere(
        `(
          purchaseOrder.orderNumber ILIKE :search
          OR CAST(enrollment.userId AS TEXT) ILIKE :search
          OR user.fullName ILIKE :search
          OR user.email ILIKE :search
          OR user.phone ILIKE :search
          OR externalGrant.externalReference ILIKE :search
        )`,
        { search },
      );
    }

    if (query.sortBy === 'amountPaid') {
      queryBuilder.orderBy(
        'COALESCE(purchaseOrder.payableAmountEur, externalGrant.amountEur)',
        sortOrder,
      );
    } else {
      queryBuilder.orderBy('enrollment.enrolledAt', sortOrder);
    }

    const [enrollments, total] = await queryBuilder.getManyAndCount();

    return {
      items: enrollments.map((enrollment) => {
        const externalGrant = this.getExternalGrant(enrollment);

        return {
          id: enrollment.id,
          courseId: enrollment.courseId,
          userId: enrollment.userId,
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
                  productId:
                    enrollment.order.providerSnapshot?.productId ?? null,
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
                    enrollment.order.providerTransaction
                      ?.providerTransactionId ?? null,
                  tokenHash:
                    enrollment.order.providerTransaction?.tokenHash ?? null,
                  verifiedAt:
                    enrollment.order.providerTransaction?.verifiedAt ?? null,
                },
              }
            : null,
          externalGrant: externalGrant
            ? this.mapExternalGrant(externalGrant)
            : null,
          amountPaid:
            enrollment.order?.paymentAmount ??
            externalGrant?.paymentAmount ??
            '0.00',
          currency:
            enrollment.order?.paymentCurrency ??
            externalGrant?.paymentCurrency ??
            CommerceCurrency.EUR,
          paymentProvider:
            enrollment.order?.paymentProvider ??
            (externalGrant ? ADMIN_EXTERNAL_PAYMENT_PROVIDER : null),
          paymentReference: externalGrant?.externalReference ?? null,
          enrollmentStatus: enrollment.status,
          accessType: enrollment.accessType,
          enrolledAt: enrollment.enrolledAt,
          refundedAt: enrollment.refundedAt,
          lastAccessedAt: enrollment.lastAccessedAt,
        };
      }),
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
        externalGrants: true,
      },
    });

    if (!enrollment) {
      throw new NotFoundException('Course enrollment not found.');
    }

    const externalGrant = enrollment.externalGrants
      .slice()
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )[0];

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

      externalGrant: externalGrant
        ? this.mapExternalGrant(externalGrant)
        : null,

      amountPaid:
        enrollment.order?.paymentAmount ??
        externalGrant?.paymentAmount ??
        '0.00',
      currency:
        enrollment.order?.paymentCurrency ??
        externalGrant?.paymentCurrency ??
        CommerceCurrency.EUR,
      paymentProvider:
        enrollment.order?.paymentProvider ??
        (externalGrant ? ADMIN_EXTERNAL_PAYMENT_PROVIDER : null),
      paymentReference: externalGrant?.externalReference ?? null,

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
          orderId: order.id,
        },
      });

      if (enrollment) {
        await this.restorePreviousPaidEntitlement({
          manager,
          enrollment,
          refundedOrderId: order.id,
          fallbackStatus: CourseEnrollmentStatus.REFUNDED,
          occurredAt: now,
        });
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
          await this.restorePreviousPaidEntitlement({
            manager,
            enrollment,
            refundedOrderId: order.id,
            fallbackStatus: CourseEnrollmentStatus.REFUNDED,
            occurredAt: now,
          });
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
    provider: CoursePaymentProvider;
    productType: CourseProviderProductType;
    accessType: CourseAccessType;
    durationDays: number | null;
    basePlanId: string | null;
  }) {
    if (input.accessType === CourseAccessType.LIFETIME) {
      if (
        input.productType !== CourseProviderProductType.NON_CONSUMABLE ||
        input.durationDays !== null ||
        input.basePlanId
      ) {
        throw new BadRequestException(
          'Lifetime access requires a non-consumable product without durationDays or basePlanId.',
        );
      }
      return;
    }

    if (
      input.productType !== CourseProviderProductType.SUBSCRIPTION ||
      !Number.isInteger(input.durationDays) ||
      (input.durationDays ?? 0) < 1 ||
      (input.durationDays ?? 0) > 3650
    ) {
      throw new BadRequestException(
        'Time-limited access requires a subscription product and durationDays between 1 and 3650.',
      );
    }

    if (
      input.provider === CoursePaymentProvider.GOOGLE_PLAY &&
      !input.basePlanId
    ) {
      throw new BadRequestException(
        'Google Play time-limited access requires a basePlanId.',
      );
    }

    if (
      input.provider === CoursePaymentProvider.APP_STORE &&
      input.basePlanId
    ) {
      throw new BadRequestException(
        'App Store mappings do not use a basePlanId.',
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
      accessType: providerProduct.accessType,
      durationDays: providerProduct.durationDays,
      basePlanId: providerProduct.basePlanId,
      offerId: providerProduct.offerId,
      isActive: providerProduct.isActive,
      createdAt: providerProduct.createdAt,
      updatedAt: providerProduct.updatedAt,
    };
  }

  private getExternalGrant(
    enrollment: CourseEnrollment,
  ): AdminCourseAccessGrant | null {
    return enrollment.externalGrants?.[0] ?? null;
  }

  private mapExternalGrant(grant: AdminCourseAccessGrant) {
    return {
      id: grant.id,
      paymentAmount: grant.paymentAmount,
      paymentCurrency: grant.paymentCurrency,
      amountEur: grant.amountEur,
      accessType: grant.accessType,
      durationDays: grant.durationDays,
      expiresAt: grant.expiresAt,
      paymentMethod: grant.paymentMethod,
      externalReference: grant.externalReference,
      paidAt: grant.paidAt,
      notes: grant.notes,
      status: grant.status,
      grantedByAdminId: grant.grantedByAdminId,
      revokedAt: grant.revokedAt,
      revokedByAdminId: grant.revokedByAdminId,
      revokeReason: grant.revokeReason,
      createdAt: grant.createdAt,
      updatedAt: grant.updatedAt,
    };
  }

  private normalizeMoney(value: string, fieldName: string): string {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) {
      throw new BadRequestException(
        `${fieldName} is outside the allowed range.`,
      );
    }

    return amount.toFixed(2);
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

  private normalizeDuration(
    accessType: CourseAccessType,
    durationDays?: number | null,
  ): number | null {
    if (accessType === CourseAccessType.LIFETIME) {
      if (durationDays !== undefined && durationDays !== null) {
        throw new BadRequestException(
          'Lifetime access cannot have durationDays.',
        );
      }
      return null;
    }

    if (
      !Number.isInteger(durationDays) ||
      (durationDays ?? 0) < 1 ||
      (durationDays ?? 0) > 3650
    ) {
      throw new BadRequestException(
        'Time-limited access requires durationDays between 1 and 3650.',
      );
    }
    return durationDays as number;
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private mapManualAccessOption(option: CourseManualAccessOption) {
    return {
      id: option.id,
      courseId: option.courseId,
      accessType: option.accessType,
      durationDays: option.durationDays,
      isActive: option.isActive,
      createdAt: option.createdAt,
      updatedAt: option.updatedAt,
    };
  }

  private async getManualAccessOptionEntity(
    courseId: string,
    optionId: string,
  ) {
    const option = await this.manualAccessOptionRepository.findOne({
      where: { id: optionId, courseId },
    });
    if (!option) {
      throw new NotFoundException('Manual course-access option not found.');
    }
    return option;
  }

  private async findManualOption(
    repository: Repository<CourseManualAccessOption>,
    courseId: string,
    accessType: CourseAccessType,
    durationDays: number | null,
    excludeId?: string,
  ) {
    const query = repository
      .createQueryBuilder('option')
      .where('option.courseId = :courseId', { courseId })
      .andWhere('option.accessType = :accessType', { accessType });
    if (durationDays === null) {
      query.andWhere('option.durationDays IS NULL');
    } else {
      query.andWhere('option.durationDays = :durationDays', { durationDays });
    }
    if (excludeId) query.andWhere('option.id != :excludeId', { excludeId });
    return query.getOne();
  }

  private async findDuplicateProviderProduct(params: {
    repository: Repository<CourseProviderProduct>;
    provider: CoursePaymentProvider;
    productId: string;
    basePlanId: string | null;
    excludeId?: string;
  }) {
    const query = params.repository
      .createQueryBuilder('providerProduct')
      .where('providerProduct.provider = :provider', {
        provider: params.provider,
      })
      .andWhere('providerProduct.productId = :productId', {
        productId: params.productId,
      });
    if (params.basePlanId) {
      query.andWhere('providerProduct.basePlanId = :basePlanId', {
        basePlanId: params.basePlanId,
      });
    } else {
      query.andWhere('providerProduct.basePlanId IS NULL');
    }
    if (params.excludeId) {
      query.andWhere('providerProduct.id != :excludeId', {
        excludeId: params.excludeId,
      });
    }
    return query.getOne();
  }

  private async assertCourseDurationAvailable(params: {
    repository: Repository<CourseProviderProduct>;
    courseId: string;
    provider: CoursePaymentProvider;
    accessType: CourseAccessType;
    durationDays: number | null;
    excludeId?: string;
  }): Promise<void> {
    if (params.accessType !== CourseAccessType.TIME_LIMITED) return;
    const query = params.repository
      .createQueryBuilder('providerProduct')
      .where('providerProduct.courseId = :courseId', {
        courseId: params.courseId,
      })
      .andWhere('providerProduct.provider = :provider', {
        provider: params.provider,
      })
      .andWhere('providerProduct.accessType = :accessType', {
        accessType: CourseAccessType.TIME_LIMITED,
      })
      .andWhere('providerProduct.durationDays = :durationDays', {
        durationDays: params.durationDays,
      });
    if (params.excludeId) {
      query.andWhere('providerProduct.id != :excludeId', {
        excludeId: params.excludeId,
      });
    }
    if (await query.getExists()) {
      throw new ConflictException(
        'This course already has the same time-limited duration for this provider.',
      );
    }
  }

  private async assertProviderProductFamilyMatches(params: {
    repository: Repository<CourseProviderProduct>;
    provider: CoursePaymentProvider;
    productId: string;
    productType: CourseProviderProductType;
    excludeId?: string;
  }): Promise<void> {
    const query = params.repository
      .createQueryBuilder('providerProduct')
      .where('providerProduct.provider = :provider', {
        provider: params.provider,
      })
      .andWhere('providerProduct.productId = :productId', {
        productId: params.productId,
      })
      .andWhere('providerProduct.productType != :productType', {
        productType: params.productType,
      });
    if (params.excludeId) {
      query.andWhere('providerProduct.id != :excludeId', {
        excludeId: params.excludeId,
      });
    }
    if (await query.getExists()) {
      throw new ConflictException(
        'A store product ID cannot be both a lifetime product and a subscription.',
      );
    }
  }

  private async restorePreviousPaidEntitlement(params: {
    manager: EntityManager;
    enrollment: CourseEnrollment;
    refundedOrderId: string;
    fallbackStatus: CourseEnrollmentStatus;
    occurredAt: Date;
  }): Promise<void> {
    const orderRepository = params.manager.getRepository(CoursePurchaseOrder);
    const enrollmentRepository = params.manager.getRepository(CourseEnrollment);
    const paidOrders = await orderRepository
      .createQueryBuilder('purchaseOrder')
      .leftJoinAndSelect('purchaseOrder.providerSnapshot', 'providerSnapshot')
      .where('purchaseOrder.userId = :userId', {
        userId: params.enrollment.userId,
      })
      .andWhere('purchaseOrder.courseId = :courseId', {
        courseId: params.enrollment.courseId,
      })
      .andWhere('purchaseOrder.status = :status', {
        status: CoursePurchaseStatus.PAID,
      })
      .andWhere('purchaseOrder.id != :refundedOrderId', {
        refundedOrderId: params.refundedOrderId,
      })
      .orderBy('purchaseOrder.paidAt', 'DESC', 'NULLS LAST')
      .addOrderBy('purchaseOrder.createdAt', 'DESC')
      .getMany();

    const lifetimeOrder = paidOrders.find(
      (order) =>
        (order.providerSnapshot?.accessType ?? CourseAccessType.LIFETIME) ===
        CourseAccessType.LIFETIME,
    );
    const timedOrder = paidOrders
      .filter(
        (order) =>
          order.providerSnapshot?.accessType ===
            CourseAccessType.TIME_LIMITED &&
          Boolean(
            order.entitlementExpiresAt &&
              order.entitlementExpiresAt > params.occurredAt,
          ),
      )
      .sort(
        (left, right) =>
          (right.entitlementExpiresAt?.getTime() ?? 0) -
          (left.entitlementExpiresAt?.getTime() ?? 0),
      )[0];
    const fallbackOrder = lifetimeOrder ?? timedOrder;

    if (fallbackOrder) {
      params.enrollment.orderId = fallbackOrder.id;
      params.enrollment.status = CourseEnrollmentStatus.ACTIVE;
      params.enrollment.accessType = lifetimeOrder
        ? CourseAccessType.LIFETIME
        : CourseAccessType.TIME_LIMITED;
      params.enrollment.expiresAt = lifetimeOrder
        ? null
        : fallbackOrder.entitlementExpiresAt;
      params.enrollment.refundedAt = null;
    } else {
      params.enrollment.status = params.fallbackStatus;
      params.enrollment.refundedAt = params.occurredAt;
    }

    await enrollmentRepository.save(params.enrollment);
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
