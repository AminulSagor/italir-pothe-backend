import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { Course, CourseStatus } from '../../courses/entities/course.entity';
import {
  VerifyCourseAppStorePurchaseDto,
  VerifyCourseGooglePlayPurchaseDto,
  CourseQuoteQueryDto,
  CreateCoursePurchaseOrderDto,
  MyEnrollmentQueryDto,
  PurchaseHistoryQueryDto,
} from '../dto/course-commerce.dto';
import { CourseEnrollment } from '../entities/course-enrollment.entity';
import { CourseOrderProviderSnapshot } from '../entities/course-order-provider-snapshot.entity';
import { CourseOrderProviderTransaction } from '../entities/course-order-provider-transaction.entity';
import { CoursePaymentAttempt } from '../entities/course-payment-attempt.entity';
import { CoursePurchaseOrder } from '../entities/course-purchase-order.entity';
import { CourseProviderProduct } from '../entities/course-provider-product.entity';
import { DemoPaymentGatewayService } from '../providers/demo-payment-gateway.service';
import { FOREX_RATE_PROVIDER } from '../providers/forex-rate-provider';
import type { ForexRateProvider } from '../providers/forex-rate-provider';
import {
  CommerceCurrency,
  CourseAccessType,
  CourseEnrollmentStatus,
  CoursePaymentAttemptStatus,
  CoursePaymentProvider,
  CourseProviderEnvironment,
  CourseProviderProductType,
  CourseProviderVerificationStatus,
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
import { StorePackageProviderProduct } from 'src/package-store/entities/store-package-provider-product.entity';
import { StoreOrderProviderTransaction } from 'src/package-store/entities/store-order-provider-transaction.entity';
import { GooglePlayBillingService } from 'src/billing/google-play/google-play-billing.service';
import { AppStoreBillingService } from 'src/billing/app-store/services/app-store-billing.service';
import { Environment, Type } from '@apple/app-store-server-library';
import { InfluencerHubService } from 'src/influencer-hub/services/influencer-hub.service';
import {
  InfluencerBillingProvider,
  InfluencerCouponProductDomain,
  InfluencerOrderDomain,
  type InfluencerCheckoutCouponResolution,
} from 'src/influencer-hub/types/influencer-hub.type';

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

    @InjectRepository(StorePackageProviderProduct)
    private readonly storePackageProviderProductRepository: Repository<StorePackageProviderProduct>,

    @InjectRepository(StoreOrderProviderTransaction)
    private readonly storeOrderProviderTransactionRepository: Repository<StoreOrderProviderTransaction>,

    private readonly appStoreBillingService: AppStoreBillingService,

    private readonly dataSource: DataSource,

    private readonly demoPaymentGateway: DemoPaymentGatewayService,

    private readonly googlePlayBillingService: GooglePlayBillingService,

    private readonly influencerHubService: InfluencerHubService,

    @Inject(FOREX_RATE_PROVIDER)
    private readonly forexRateProvider: ForexRateProvider,
  ) {}

  async getQuote(userId: string, courseId: string, query: CourseQuoteQueryDto) {
    const course = await this.getPublishedCourse(courseId);

    let providerProduct: CourseProviderProduct | null = null;

    if (!course.isFree) {
      if (!query.provider) {
        throw new BadRequestException(
          'Payment provider is required for a paid course. ' +
            'Use provider=google_play on Android or provider=app_store on iOS.',
        );
      }

      providerProduct = this.requireActiveProviderProduct(
        course,
        query.provider,
      );
    }

    const currency = query.currency ?? CommerceCurrency.EUR;

    let couponResolution: InfluencerCheckoutCouponResolution | null = null;
    let quote: CalculatedCourseQuote;

    if (query.couponCode?.trim()) {
      if (!providerProduct) {
        throw new BadRequestException(
          'Payment provider is required before applying a coupon.',
        );
      }

      couponResolution =
        await this.influencerHubService.resolveCouponForCheckout({
          couponCode: query.couponCode,
          productDomain: InfluencerCouponProductDomain.COURSE,
          productId: course.id,
          provider: query.provider as unknown as InfluencerBillingProvider,
          regularProviderProductId: providerProduct.productId,
          basePriceEur: course.price ?? '0.00',
        });

      providerProduct = this.requireActiveProviderProduct(
        course,
        query.provider,
        couponResolution.discountedProviderProductId,
      );

      quote = await this.buildCourseQuoteFromInfluencerResolution(
        couponResolution,
        query.currency ?? CommerceCurrency.EUR,
      );
    } else {
      quote = await this.calculateQuote(course, currency);
    }

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

      storeProduct: providerProduct
        ? {
            ...this.mapProviderProduct(providerProduct),
            productId:
              couponResolution?.discountedProviderProductId ??
              providerProduct.productId,
            basePlanId:
              couponResolution?.providerBasePlanId ??
              providerProduct.basePlanId,
            offerId:
              couponResolution?.providerOfferId ?? providerProduct.offerId,
          }
        : null,

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

      supportedProviders: (course.providerProducts ?? [])
        .filter((item) => item.isActive)
        .map((item) => this.mapProviderProduct(item)),

      developmentVerification:
        query.provider === CoursePaymentProvider.GOOGLE_PLAY
          ? !this.googlePlayBillingService.isRealVerificationEnabled()
          : query.provider === CoursePaymentProvider.APP_STORE
            ? this.demoPaymentGateway.isDemoModeEnabled()
            : false,

      pricingNote:
        couponResolution?.taxWarning ??
        'Google Play or App Store controls the final localized amount charged.',
    };
  }

  async createOrder(userId: string, dto: CreateCoursePurchaseOrderDto) {
    const course = await this.getPublishedCourse(dto.courseId);

    if (course.isFree) {
      throw new BadRequestException(
        'This course is free and does not require a purchase order.',
      );
    }

    const regularProviderProduct = this.requireActiveProviderProduct(
      course,
      dto.paymentProvider,
    );

    let providerProduct = regularProviderProduct;
    let checkoutProductId = dto.productId.trim();
    let checkoutBasePlanId = regularProviderProduct.basePlanId;
    let checkoutOfferId = regularProviderProduct.offerId;
    let couponResolution: InfluencerCheckoutCouponResolution | null = null;

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
        providerSnapshot: true,
        providerTransaction: true,
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

    const selectedCurrency = dto.currency ?? CommerceCurrency.EUR;
    let quote: CalculatedCourseQuote;

    if (dto.couponCode?.trim()) {
      couponResolution =
        await this.influencerHubService.resolveCouponForCheckout({
          couponCode: dto.couponCode,
          productDomain: InfluencerCouponProductDomain.COURSE,
          productId: course.id,
          provider: dto.paymentProvider as unknown as InfluencerBillingProvider,
          regularProviderProductId: regularProviderProduct.productId,
          basePriceEur: course.price ?? '0.00',
        });

      checkoutProductId = couponResolution.discountedProviderProductId;

      providerProduct = this.requireActiveProviderProduct(
        course,
        dto.paymentProvider,
        checkoutProductId,
      );

      checkoutBasePlanId = providerProduct.basePlanId;
      checkoutOfferId = providerProduct.offerId;

      if (dto.productId.trim() !== checkoutProductId) {
        throw new BadRequestException(
          'The selected store product does not match the validated coupon discount product.',
        );
      }

      quote = await this.buildCourseQuoteFromInfluencerResolution(
        couponResolution,
        selectedCurrency,
      );
    } else {
      providerProduct = this.requireActiveProviderProduct(
        course,
        dto.paymentProvider,
        dto.productId,
      );

      checkoutProductId = providerProduct.productId;
      checkoutBasePlanId = providerProduct.basePlanId;
      checkoutOfferId = providerProduct.offerId;

      quote = await this.calculateQuote(course, selectedCurrency);
    }

    await this.assertProductNotMappedToPackage(
      dto.paymentProvider,
      checkoutProductId,
    );

    const orderId = await this.dataSource.transaction(async (manager) => {
      const orderRepository = manager.getRepository(CoursePurchaseOrder);
      const providerSnapshotRepository = manager.getRepository(
        CourseOrderProviderSnapshot,
      );
      const providerTransactionRepository = manager.getRepository(
        CourseOrderProviderTransaction,
      );

      const order = await orderRepository.save(
        orderRepository.create({
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
          paymentProvider: providerProduct.provider,
          status: CoursePurchaseStatus.PENDING,
          idempotencyKey: dto.idempotencyKey,
          paidAt: null,
          refundedAt: null,
        }),
      );

      await providerSnapshotRepository.save(
        providerSnapshotRepository.create({
          orderId: order.id,
          providerProductId: providerProduct.id,
          provider: providerProduct.provider,
          productId: checkoutProductId,
          productType: providerProduct.productType,
          basePlanId: checkoutBasePlanId,
          offerId: checkoutOfferId,
        }),
      );

      await providerTransactionRepository.save(
        providerTransactionRepository.create({
          orderId: order.id,
          provider: providerProduct.provider,
          productId: checkoutProductId,
          tokenHash: null,
          providerTransactionId: null,
          environment: CourseProviderEnvironment.DEVELOPMENT,
          verificationStatus: CourseProviderVerificationStatus.PENDING,
          verifiedAt: null,
          verificationPayload: null,
        }),
      );

      if (couponResolution) {
        await this.influencerHubService.recordPendingOrderAttribution(manager, {
          userId,
          orderDomain: InfluencerOrderDomain.COURSE,
          orderId: order.id,
          productId: course.id,
          resolution: couponResolution,
        });
      }

      return order.id;
    });

    const savedOrder = await this.getOwnedOrder(userId, orderId);

    return {
      ...(await this.buildOrderResponse(savedOrder)),
      checkoutAction: this.demoPaymentGateway.buildCheckoutAction(savedOrder),
    };
  }

  async verifyGooglePlayPurchase(params: {
    userId: string;
    orderId: string;
    dto: VerifyCourseGooglePlayPurchaseDto;
  }) {
    const order = await this.getOwnedOrder(params.userId, params.orderId);

    this.assertConfirmableProvider(order, CoursePaymentProvider.GOOGLE_PLAY);

    const productId = params.dto.productId.trim();
    const purchaseToken = params.dto.purchaseToken.trim();

    if (productId !== order.providerSnapshot.productId) {
      throw new BadRequestException(
        'Google Play product ID does not match the ordered course.',
      );
    }

    if (
      order.providerSnapshot.productType !==
      CourseProviderProductType.NON_CONSUMABLE
    ) {
      throw new BadRequestException(
        'A lifetime course must use a non-consumable Google Play product.',
      );
    }

    if (!this.googlePlayBillingService.isRealVerificationEnabled()) {
      this.demoPaymentGateway.assertDemoModeEnabled();

      const tokenHash = createHash('sha256')
        .update(purchaseToken)
        .digest('hex');

      const providerReference =
        params.dto.transactionId?.trim() || `google-play:${tokenHash}`;

      await this.markProviderTransactionVerified({
        order,
        tokenHash,
        providerTransactionId: providerReference,
        environment: CourseProviderEnvironment.DEVELOPMENT,
        payload: {
          source: 'development_google_play_verifier',
        },
      });

      return this.completePayment({
        orderId: order.id,
        provider: CoursePaymentProvider.GOOGLE_PLAY,
        providerReference,
      });
    }

    const expectedObfuscatedAccountId = createHash('sha256')
      .update(order.userId)
      .digest('hex');

    const verifiedPurchase =
      await this.googlePlayBillingService.verifyOneTimeProduct({
        purchaseToken,
        expectedProductId: order.providerSnapshot.productId,
        expectedOfferId: order.providerSnapshot.offerId,
        expectedObfuscatedAccountId,
      });

    if (verifiedPurchase.quantity !== 1) {
      throw new BadRequestException(
        'Course purchases must have a quantity of exactly one.',
      );
    }

    const providerReference =
      verifiedPurchase.orderId ||
      `google-play:${verifiedPurchase.purchaseTokenHash}`;

    await this.markProviderTransactionVerified({
      order,
      tokenHash: verifiedPurchase.purchaseTokenHash,
      providerTransactionId: providerReference,
      environment: verifiedPurchase.isTestPurchase
        ? CourseProviderEnvironment.SANDBOX
        : CourseProviderEnvironment.PRODUCTION,
      payload: {
        source: 'google_play_developer_api',
        productId: verifiedPurchase.productId,
        orderId: verifiedPurchase.orderId,
        purchaseOptionId: verifiedPurchase.purchaseOptionId,
        offerId: verifiedPurchase.offerId,
        purchaseState: verifiedPurchase.purchaseState,
        acknowledgementState: verifiedPurchase.acknowledgementState,
        consumptionState: verifiedPurchase.consumptionState,
        purchaseCompletionTime: verifiedPurchase.purchaseCompletionTime,
        regionCode: verifiedPurchase.regionCode,
        isTestPurchase: verifiedPurchase.isTestPurchase,
      },
    });

    const completion = await this.completePayment({
      orderId: order.id,
      provider: CoursePaymentProvider.GOOGLE_PLAY,
      providerReference,
    });

    const acknowledgement =
      await this.googlePlayBillingService.acknowledgeOneTimeProduct({
        productId: order.providerSnapshot.productId,
        purchaseToken,
      });

    return {
      ...completion,
      googlePlayProcessing: {
        acknowledged: acknowledgement.acknowledged,
        alreadyAcknowledged: acknowledgement.alreadyAcknowledged,
      },
    };
  }

  async verifyAppStorePurchase(params: {
    userId: string;
    orderId: string;
    dto: VerifyCourseAppStorePurchaseDto;
  }) {
    const order = await this.getOwnedOrder(params.userId, params.orderId);

    this.assertConfirmableProvider(order, CoursePaymentProvider.APP_STORE);

    const productId = params.dto.productId.trim();

    if (productId !== order.providerSnapshot.productId) {
      throw new BadRequestException(
        'App Store product ID does not match the ordered course.',
      );
    }

    if (
      order.providerSnapshot.productType !==
      CourseProviderProductType.NON_CONSUMABLE
    ) {
      throw new BadRequestException(
        'A lifetime course must use a non-consumable App Store product.',
      );
    }

    /*
     * Keep the existing development mode until the
     * Apple configuration is ready.
     */
    if (!this.appStoreBillingService.isRealVerificationEnabled()) {
      this.demoPaymentGateway.assertDemoModeEnabled();

      const providerReference = params.dto.transactionId.trim();

      const tokenHash = createHash('sha256')
        .update(params.dto.signedTransactionInfo)
        .digest('hex');

      await this.markProviderTransactionVerified({
        order,

        tokenHash,

        providerTransactionId: providerReference,

        environment: CourseProviderEnvironment.DEVELOPMENT,

        payload: {
          source: 'development_storekit_verifier',

          signedTransactionProvided: true,
        },
      });

      return this.completePayment({
        orderId: order.id,

        provider: CoursePaymentProvider.APP_STORE,

        providerReference,
      });
    }

    const verified = await this.appStoreBillingService.verifyTransaction({
      signedTransactionInfo: params.dto.signedTransactionInfo,

      expectedTransactionId: params.dto.transactionId,

      expectedProductId: order.providerSnapshot.productId,

      /*
       * The Flutter StoreKit purchase must pass
       * appAccountToken = order.id.
       */
      expectedAppAccountToken: order.id,

      expectedType: Type.NON_CONSUMABLE,
    });

    const tokenHash = this.appStoreBillingService.hash(
      verified.originalTransactionId,
    );

    await this.markProviderTransactionVerified({
      order,

      tokenHash,

      providerTransactionId: verified.transactionId,

      environment:
        verified.environment === Environment.PRODUCTION
          ? CourseProviderEnvironment.PRODUCTION
          : CourseProviderEnvironment.SANDBOX,

      payload: {
        source: 'app_store_server_api',

        ...verified.sanitizedPayload,
      },
    });

    return this.completePayment({
      orderId: order.id,

      provider: CoursePaymentProvider.APP_STORE,

      providerReference: verified.transactionId,
    });
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
      .leftJoinAndSelect('purchaseOrder.providerSnapshot', 'providerSnapshot')
      .leftJoinAndSelect(
        'purchaseOrder.providerTransaction',
        'providerTransaction',
      )
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

  private async markProviderTransactionVerified(params: {
    order: CoursePurchaseOrder;
    tokenHash: string | null;
    providerTransactionId: string;
    environment: CourseProviderEnvironment;
    payload: Record<string, unknown>;
  }) {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(CourseOrderProviderTransaction);

      const transaction = await repository.findOne({
        where: {
          orderId: params.order.id,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!transaction) {
        throw new ConflictException(
          'The course order is missing its provider transaction record.',
        );
      }

      if (transaction.provider !== params.order.providerSnapshot.provider) {
        throw new ConflictException(
          'The provider transaction does not match the order provider.',
        );
      }

      if (transaction.productId !== params.order.providerSnapshot.productId) {
        throw new ConflictException(
          'The provider transaction product does not match the order.',
        );
      }

      await this.lockProviderTransactionIdentity(
        manager,
        transaction.provider,
        params.providerTransactionId,
        params.tokenHash,
      );

      await this.assertTransactionNotUsedByPackage(
        transaction.provider,
        params.providerTransactionId,
        params.tokenHash,
        manager,
      );

      const duplicateQuery = repository
        .createQueryBuilder('providerTransaction')
        .where('providerTransaction.provider = :provider', {
          provider: transaction.provider,
        })
        .andWhere('providerTransaction.id != :transactionId', {
          transactionId: transaction.id,
        })
        .andWhere(
          `(
          providerTransaction.providerTransactionId = :providerTransactionId
          ${
            params.tokenHash
              ? 'OR providerTransaction.tokenHash = :tokenHash'
              : ''
          }
        )`,
          {
            providerTransactionId: params.providerTransactionId,
            ...(params.tokenHash
              ? {
                  tokenHash: params.tokenHash,
                }
              : {}),
          },
        );

      const duplicate = await duplicateQuery.getOne();

      if (duplicate) {
        throw new ConflictException(
          'This store transaction has already been assigned to another course order.',
        );
      }

      if (
        transaction.verificationStatus ===
        CourseProviderVerificationStatus.VERIFIED
      ) {
        const sameTransaction =
          transaction.providerTransactionId === params.providerTransactionId &&
          transaction.tokenHash === params.tokenHash;

        if (!sameTransaction) {
          throw new ConflictException(
            'This course order was already verified using another store transaction.',
          );
        }

        return;
      }

      transaction.tokenHash = params.tokenHash;
      transaction.providerTransactionId = params.providerTransactionId;
      transaction.environment = params.environment;
      transaction.verificationStatus =
        CourseProviderVerificationStatus.VERIFIED;
      transaction.verifiedAt = new Date();
      transaction.verificationPayload = params.payload;

      await repository.save(transaction);
    });
  }
  private async completePayment(params: {
    orderId: string;
    provider: CoursePaymentProvider;
    providerReference: string;
  }) {
    return this.dataSource.transaction(async (manager) => {
      const orderRepository = manager.getRepository(CoursePurchaseOrder);

      const attemptRepository = manager.getRepository(CoursePaymentAttempt);

      const enrollmentRepository = manager.getRepository(CourseEnrollment);

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

      if (!order.courseId) {
        throw new ConflictException(
          'This course order is detached from its course because the course was permanently deleted. It cannot be completed.',
        );
      }

      const courseId = order.courseId;

      const [course, providerSnapshot, providerTransaction] = await Promise.all(
        [
          manager.getRepository(Course).findOne({
            where: {
              id: courseId,
            },
          }),

          manager.getRepository(CourseOrderProviderSnapshot).findOne({
            where: {
              orderId: order.id,
            },
          }),

          manager.getRepository(CourseOrderProviderTransaction).findOne({
            where: {
              orderId: order.id,
            },
          }),
        ],
      );

      if (!providerSnapshot || !providerTransaction) {
        throw new ConflictException(
          'The course order is missing provider verification records.',
        );
      }

      if (course) {
        order.course = course;
      }

      order.providerSnapshot = providerSnapshot;
      order.providerTransaction = providerTransaction;

      if (
        order.paymentProvider !== params.provider ||
        providerSnapshot.provider !== params.provider ||
        providerTransaction.provider !== params.provider
      ) {
        throw new BadRequestException(
          'Payment provider does not match the course order.',
        );
      }

      if (
        providerTransaction.verificationStatus !==
        CourseProviderVerificationStatus.VERIFIED
      ) {
        throw new BadRequestException(
          'The store transaction has not been verified.',
        );
      }

      if (
        providerTransaction.providerTransactionId !== params.providerReference
      ) {
        throw new BadRequestException(
          'Verified transaction reference does not match the purchase.',
        );
      }

      if (order.status === CoursePurchaseStatus.PAID) {
        const existingEnrollment = await enrollmentRepository.findOne({
          where: {
            userId: order.userId,
            courseId,
            status: CourseEnrollmentStatus.ACTIVE,
          },
        });

        if (!existingEnrollment) {
          throw new ConflictException(
            'The paid course order is missing its active enrollment.',
          );
        }

        return {
          message: 'Course purchase completed successfully.',
          order: await this.buildOrderResponse(order),
          enrollment: {
            id: existingEnrollment.id,
            courseId: existingEnrollment.courseId,
            status: existingEnrollment.status,
            accessType: existingEnrollment.accessType,
            enrolledAt: existingEnrollment.enrolledAt,
          },
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
          providerReference: params.providerReference,
        },
      });

      if (existingReference && existingReference.orderId !== order.id) {
        throw new ConflictException(
          'This payment reference has already been used.',
        );
      }

      const now = new Date();

      if (!existingReference) {
        await attemptRepository.save(
          attemptRepository.create({
            orderId: order.id,
            paymentProvider: order.paymentProvider,
            status: CoursePaymentAttemptStatus.SUCCEEDED,
            providerReference: params.providerReference,
            amount: order.paymentAmount,
            currency: order.paymentCurrency,
            failureCode: null,
            failureMessage: null,
            completedAt: now,
          }),
        );
      }

      order.status = CoursePurchaseStatus.PAID;
      order.paidAt = now;
      order.refundedAt = null;

      await orderRepository.save(order);

      let enrollment = await enrollmentRepository.findOne({
        where: {
          userId: order.userId,
          courseId,
        },
      });

      if (!enrollment) {
        enrollment = enrollmentRepository.create({
          userId: order.userId,
          courseId,
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

      await this.influencerHubService.convertOrderAttribution(manager, {
        orderDomain: InfluencerOrderDomain.COURSE,
        orderId: order.id,
        paidAt: now,
      });

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

  private async buildCourseQuoteFromInfluencerResolution(
    resolution: InfluencerCheckoutCouponResolution,
    currency: CommerceCurrency,
  ): Promise<CalculatedCourseQuote> {
    if (currency === CommerceCurrency.EUR) {
      return {
        basePriceEur: resolution.basePriceEur,
        couponCode: resolution.couponCode,
        discountPercentage: resolution.discountPercentage,
        discountAmountEur: resolution.discountAmountEur,
        payableAmountEur: resolution.payableAmountEur,
        selectedCurrency: CommerceCurrency.EUR,
        forexRate: null,
        originalAmount: resolution.basePriceEur,
        discountAmount: resolution.discountAmountEur,
        payableAmount: resolution.payableAmountEur,
      };
    }

    const forexRate = await this.forexRateProvider.getEurToBdtRate();

    const originalAmountBdt = convertEurToBdt({
      amountEur: resolution.basePriceEur,
      forexRate,
    });

    const payableAmountBdt = convertEurToBdt({
      amountEur: resolution.payableAmountEur,
      forexRate,
    });

    return {
      basePriceEur: resolution.basePriceEur,
      couponCode: resolution.couponCode,
      discountPercentage: resolution.discountPercentage,
      discountAmountEur: resolution.discountAmountEur,
      payableAmountEur: resolution.payableAmountEur,
      selectedCurrency: CommerceCurrency.BDT,
      forexRate,
      originalAmount: originalAmountBdt,
      discountAmount: subtractMoney(originalAmountBdt, payableAmountBdt),
      payableAmount: payableAmountBdt,
    };
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

  private assertStoreCouponNotUsed(couponCode?: string) {
    if (couponCode?.trim()) {
      throw new BadRequestException(
        'Backend coupon codes cannot change Google Play or App Store prices. Configure and map a store offer instead.',
      );
    }
  }

  private isCouponProviderProductId(productId: string): boolean {
    return productId.trim().toLowerCase().startsWith('coupon_');
  }

  private getActiveProviderProduct(
    course: Course,
    provider: CoursePaymentProvider,
    productId?: string,
  ) {
    const activeProducts = (course.providerProducts ?? []).filter(
      (item) => item.provider === provider && item.isActive,
    );

    if (productId?.trim()) {
      const requestedProductId = productId.trim();

      return activeProducts.find(
        (item) => item.productId === requestedProductId,
      );
    }

    return (
      activeProducts.find(
        (item) => !this.isCouponProviderProductId(item.productId),
      ) ?? activeProducts[0]
    );
  }

  private requireActiveProviderProduct(
    course: Course,
    provider: CoursePaymentProvider,
    productId?: string,
  ) {
    const providerProduct = this.getActiveProviderProduct(
      course,
      provider,
      productId,
    );

    if (!providerProduct) {
      throw new BadRequestException(
        productId
          ? 'This course has no active mapping for the supplied store product ID.'
          : 'This course has no active regular product mapping for the selected provider.',
      );
    }

    if (
      providerProduct.productType !== CourseProviderProductType.NON_CONSUMABLE
    ) {
      throw new BadRequestException(
        'Lifetime courses must use non-consumable store products.',
      );
    }

    return providerProduct;
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
    };
  }

  private async getPublishedCourse(courseId: string): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: {
        id: courseId,
        status: CourseStatus.PUBLISHED,
      },
      relations: {
        providerProducts: true,
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
        providerSnapshot: true,
        providerTransaction: true,
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
    if (!order.providerSnapshot || !order.providerTransaction) {
      throw new ConflictException(
        'This legacy course order does not contain provider records. Create a new order.',
      );
    }

    if (
      order.paymentProvider !== provider ||
      order.providerSnapshot.provider !== provider ||
      order.providerTransaction.provider !== provider
    ) {
      throw new BadRequestException(
        `This order was created for ${order.paymentProvider}.`,
      );
    }
  }

  private assertIdempotentOrderMatches(
    order: CoursePurchaseOrder,
    dto: CreateCoursePurchaseOrderDto,
  ) {
    if (!order.providerSnapshot) {
      throw new ConflictException(
        'The idempotency key belongs to a legacy order without a provider snapshot. Use a new idempotency key.',
      );
    }

    if (
      order.courseId !== dto.courseId ||
      order.paymentCurrency !== (dto.currency ?? CommerceCurrency.EUR) ||
      order.paymentProvider !== dto.paymentProvider ||
      order.providerSnapshot.productId !== dto.productId.trim()
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
      (order.courseId
        ? await this.courseRepository.findOne({
            where: {
              id: order.courseId,
            },
          })
        : null);

    return {
      ...this.mapOrderResponse(order),
      course: {
        id: order.courseId,
        title: course?.title ?? null,
        subtitle: course?.subtitle ?? null,
        isFree: course?.isFree ?? null,
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
      storeProduct: order.providerSnapshot
        ? {
            providerProductId: order.providerSnapshot.providerProductId,
            provider: order.providerSnapshot.provider,
            productId: order.providerSnapshot.productId,
            productType: order.providerSnapshot.productType,
            basePlanId: order.providerSnapshot.basePlanId,
            offerId: order.providerSnapshot.offerId,
          }
        : null,
      verification: order.providerTransaction
        ? {
            environment: order.providerTransaction.environment,
            status: order.providerTransaction.verificationStatus,
            providerTransactionId:
              order.providerTransaction.providerTransactionId,
            verifiedAt: order.providerTransaction.verifiedAt,
          }
        : null,
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

  private async assertProductNotMappedToPackage(
    provider: CoursePaymentProvider,
    productId: string,
  ): Promise<void> {
    const packageProduct = await this.storePackageProviderProductRepository
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
        'This store product belongs to an AI, CV, or streak package and cannot be used to purchase a course.',
      );
    }
  }

  private async lockProviderTransactionIdentity(
    manager: EntityManager,
    provider: CoursePaymentProvider,
    providerTransactionId: string,
    tokenHash: string | null,
  ): Promise<void> {
    const lockKeys = [
      `billing-transaction:${provider}:reference:${providerTransactionId}`,
    ];

    if (tokenHash) {
      lockKeys.push(`billing-transaction:${provider}:token:${tokenHash}`);
    }

    lockKeys.sort();

    for (const lockKey of lockKeys) {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
        [lockKey],
      );
    }
  }

  private async assertTransactionNotUsedByPackage(
    provider: CoursePaymentProvider,
    providerTransactionId: string,
    tokenHash: string | null,
    manager: EntityManager,
  ): Promise<void> {
    const repository = manager.getRepository(StoreOrderProviderTransaction);

    const queryBuilder = repository
      .createQueryBuilder('packageTransaction')
      .where('packageTransaction.provider = :provider', {
        provider,
      })
      .andWhere(
        `(
        packageTransaction.providerTransactionId = :providerTransactionId
        ${tokenHash ? 'OR packageTransaction.tokenHash = :tokenHash' : ''}
      )`,
        {
          providerTransactionId,
          ...(tokenHash ? { tokenHash } : {}),
        },
      );

    const duplicate = await queryBuilder.getOne();

    if (duplicate) {
      throw new ConflictException(
        'This store purchase token or transaction ID has already been used for a package purchase.',
      );
    }
  }
}
