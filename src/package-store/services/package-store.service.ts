import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import {
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import { CoursePurchaseOrder } from 'src/module-2/course-commerce/entities/course-purchase-order.entity';
import { FOREX_RATE_PROVIDER } from 'src/module-2/course-commerce/providers/forex-rate-provider';
import type { ForexRateProvider } from 'src/module-2/course-commerce/providers/forex-rate-provider';
import { CommerceCurrency } from 'src/module-2/course-commerce/types/course-commerce.type';

import {
  AdminStoreOrderQueryDto,
  ConfirmStoreGooglePlayDemoDto,
  ConfirmStoreStripeDemoDto,
  CreateStoreOrderDto,
  CreateStorePackageDto,
  PublicStorePackageQueryDto,
  RefundStoreOrderDto,
  ReorderStorePackagesDto,
  StoreOrderHistoryQueryDto,
  StorePackageQueryDto,
  StorePackageQuoteQueryDto,
  UpdateCvEconomyConfigDto,
  UpdateStorePackageDto,
} from '../dto/package-store.dto';
import { CvEconomyConfig } from '../entities/cv-economy-config.entity';
import { StoreOrder } from '../entities/store-order.entity';
import { StoreOrderPackageSnapshot } from '../entities/store-order-package-snapshot.entity';
import { StoreOrderPayment } from '../entities/store-order-payment.entity';
import { StoreOrderPricing } from '../entities/store-order-pricing.entity';
import { StoreOrderReversal } from '../entities/store-order-reversal.entity';
import { StoreOrderTimelineEvent } from '../entities/store-order-timeline-event.entity';
import { StorePackage } from '../entities/store-package.entity';
import { StorePackageCommerce } from '../entities/store-package-commerce.entity';
import { StorePackageEntitlement } from '../entities/store-package-entitlement.entity';
import {
  PurchaseHistoryCategory,
  PurchaseHistorySortBy,
  StoreBillingModel,
  StoreMarketingBadge,
  StoreOrderStatus,
  StorePackageStatus,
  StorePackageType,
  StorePaymentProvider,
  StorePublicPackageSortBy,
  StoreSortOrder,
  StoreTimelineEventType,
  StreakProtectionMode,
  type StorePackageResponse,
  type StoreQuote,
} from '../types/package-store.type';
import { StoreWalletService } from './store-wallet.service';

interface AppliedPackageCoupon {
  code: string | null;
  percentage: number;
}

interface NormalizedPackageValues {
  priceEur: string;
  billingModel: StoreBillingModel;
  marketingBadge: StoreMarketingBadge;
  couponsEnabled: boolean;
  couponCode: string | null;
  googlePlayProductId: string | null;
  stripePriceId: string | null;

  voiceMinutes: number | null;
  textTokens: number | null;
  freezeCount: number | null;
  cvCreditCount: number | null;
  streakProtectionMode: StreakProtectionMode | null;
  protectionDurationDays: number | null;
}

interface PackageNormalizationInput {
  priceEur: string;
  billingModel?: StoreBillingModel;

  voiceMinutes?: number | null;
  textTokens?: number | null;
  freezeCount?: number | null;
  cvCreditCount?: number | null;

  streakProtectionMode?: StreakProtectionMode | null;
  protectionDurationDays?: number | null;

  marketingBadge?: StoreMarketingBadge;

  couponsEnabled?: boolean;
  couponCode?: string | null;

  googlePlayProductId?: string | null;
  stripePriceId?: string | null;
}

interface CourseHistoryRecord {
  id: string;
  orderNumber: string;
  userId: string;
  courseId: string;

  courseTitleSnapshot?: string;
  courseNameSnapshot?: string;

  status: string;

  paymentProvider?: string | null;
  paymentCurrency?: CommerceCurrency;

  paymentAmount?: string;
  payableAmountEur?: string;
  totalAmountEur?: string;

  paidAt?: Date | null;
  createdAt: Date;
}

@Injectable()
export class PackageStoreService {
  constructor(
    @InjectRepository(StorePackage)
    private readonly packageRepository: Repository<StorePackage>,

    @InjectRepository(StorePackageCommerce)
    private readonly packageCommerceRepository: Repository<StorePackageCommerce>,

    @InjectRepository(StorePackageEntitlement)
    private readonly packageEntitlementRepository: Repository<StorePackageEntitlement>,

    @InjectRepository(StoreOrder)
    private readonly orderRepository: Repository<StoreOrder>,

    @InjectRepository(StoreOrderPackageSnapshot)
    private readonly orderSnapshotRepository: Repository<StoreOrderPackageSnapshot>,

    @InjectRepository(StoreOrderPricing)
    private readonly orderPricingRepository: Repository<StoreOrderPricing>,

    @InjectRepository(StoreOrderPayment)
    private readonly orderPaymentRepository: Repository<StoreOrderPayment>,

    @InjectRepository(StoreOrderReversal)
    private readonly orderReversalRepository: Repository<StoreOrderReversal>,

    @InjectRepository(StoreOrderTimelineEvent)
    private readonly timelineRepository: Repository<StoreOrderTimelineEvent>,

    @InjectRepository(CvEconomyConfig)
    private readonly configRepository: Repository<CvEconomyConfig>,

    @InjectRepository(CoursePurchaseOrder)
    private readonly courseOrderRepository: Repository<CoursePurchaseOrder>,

    @Inject(FOREX_RATE_PROVIDER)
    private readonly forexRateProvider: ForexRateProvider,

    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly walletService: StoreWalletService,
  ) {}

  // =========================================================
  // Admin dashboard
  // =========================================================

  async getDashboard() {
    const [orders, packages] = await Promise.all([
      this.orderRepository.find({
        relations: ['snapshot', 'pricing', 'payment'],
      }),
      this.packageRepository.find({
        relations: ['commerce', 'entitlement'],
      }),
    ]);

    const completedOrders = orders.filter(
      (order) => order.status === StoreOrderStatus.COMPLETED,
    );

    const totalRevenueEur = completedOrders.reduce(
      (sum, order) => sum + Number(order.pricing?.totalAmountEur ?? 0),
      0,
    );

    const now = new Date();

    const currentMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    const previousMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );

    const currentMonthOrders = completedOrders.filter(
      (order) =>
        order.payment?.paidAt && order.payment.paidAt >= currentMonthStart,
    );

    const previousMonthOrders = completedOrders.filter(
      (order) =>
        order.payment?.paidAt &&
        order.payment.paidAt >= previousMonthStart &&
        order.payment.paidAt < currentMonthStart,
    );

    const currentMonthRevenue = currentMonthOrders.reduce(
      (sum, order) => sum + Number(order.pricing?.totalAmountEur ?? 0),
      0,
    );

    const previousMonthRevenue = previousMonthOrders.reduce(
      (sum, order) => sum + Number(order.pricing?.totalAmountEur ?? 0),
      0,
    );

    const packageSales = new Map<
      string,
      {
        packageId: string;
        packageName: string;
        orders: number;
      }
    >();

    for (const order of completedOrders) {
      const current = packageSales.get(order.packageId);

      if (current) {
        current.orders += 1;
      } else {
        packageSales.set(order.packageId, {
          packageId: order.packageId,
          packageName: order.snapshot?.packageName ?? 'Unknown package',
          orders: 1,
        });
      }
    }

    const topPackage =
      [...packageSales.values()].sort(
        (left, right) => right.orders - left.orders,
      )[0] ?? null;

    return {
      totalRevenueEur: this.formatMoneyFromNumber(totalRevenueEur),

      totalOrders: completedOrders.length,

      topPackage: topPackage
        ? {
            id: topPackage.packageId,
            name: topPackage.packageName,
            orderCount: topPackage.orders,

            salesPercentage:
              completedOrders.length > 0
                ? Number(
                    (
                      (topPackage.orders / completedOrders.length) *
                      100
                    ).toFixed(2),
                  )
                : 0,
          }
        : null,

      changes: {
        revenuePercentage: this.calculatePercentageChange(
          previousMonthRevenue,
          currentMonthRevenue,
        ),

        orderPercentage: this.calculatePercentageChange(
          previousMonthOrders.length,
          currentMonthOrders.length,
        ),
      },

      packageCounts: {
        total: packages.length,

        published: packages.filter(
          (item) => item.status === StorePackageStatus.PUBLISHED,
        ).length,

        archived: packages.filter(
          (item) => item.status === StorePackageStatus.ARCHIVED,
        ).length,
      },
    };
  }

  // =========================================================
  // Admin package management
  // =========================================================

  async createPackage(dto: CreateStorePackageDto) {
    const normalized = this.normalizePackageValues(dto.packageType, {
      priceEur: dto.priceEur,
      billingModel: dto.billingModel,
      voiceMinutes: dto.voiceMinutes,
      textTokens: dto.textTokens,
      freezeCount: dto.freezeCount,
      cvCreditCount: dto.cvCreditCount,

      streakProtectionMode: dto.streakProtectionMode,

      protectionDurationDays: dto.protectionDurationDays,

      marketingBadge: dto.marketingBadge,
      couponsEnabled: dto.couponsEnabled,
      couponCode: dto.couponCode,

      googlePlayProductId: dto.googlePlayProductId,

      stripePriceId: dto.stripePriceId,
    });

    const packageId = await this.dataSource.transaction(async (manager) => {
      const packageRepository = manager.getRepository(StorePackage);

      const commerceRepository = manager.getRepository(StorePackageCommerce);

      const entitlementRepository = manager.getRepository(
        StorePackageEntitlement,
      );

      const storePackage = await packageRepository.save(
        packageRepository.create({
          packageType: dto.packageType,

          name: dto.name.trim(),

          description: dto.description?.trim() || null,

          sortOrder: dto.sortOrder ?? 0,

          status: StorePackageStatus.PUBLISHED,

          publishedAt: new Date(),
          archivedAt: null,
        }),
      );

      await commerceRepository.save(
        commerceRepository.create({
          packageId: storePackage.id,

          priceEur: normalized.priceEur,

          billingModel: normalized.billingModel,

          marketingBadge: normalized.marketingBadge,

          couponsEnabled: normalized.couponsEnabled,

          couponCode: normalized.couponCode,

          googlePlayProductId: normalized.googlePlayProductId,

          stripePriceId: normalized.stripePriceId,
        }),
      );

      await entitlementRepository.save(
        entitlementRepository.create({
          packageId: storePackage.id,

          voiceMinutes: normalized.voiceMinutes,

          textTokens: normalized.textTokens,

          freezeCount: normalized.freezeCount,

          cvCreditCount: normalized.cvCreditCount,

          streakProtectionMode: normalized.streakProtectionMode,

          protectionDurationDays: normalized.protectionDurationDays,
        }),
      );

      return storePackage.id;
    });

    return this.findPackageById(packageId);
  }

  async findPackages(query: StorePackageQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const queryBuilder = this.packageRepository
      .createQueryBuilder('storePackage')
      .leftJoinAndSelect('storePackage.commerce', 'commerce')
      .leftJoinAndSelect('storePackage.entitlement', 'entitlement')
      .orderBy('storePackage.sortOrder', 'ASC')
      .addOrderBy('storePackage.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.packageType) {
      queryBuilder.andWhere('storePackage.packageType = :packageType', {
        packageType: query.packageType,
      });
    }

    if (query.status) {
      queryBuilder.andWhere('storePackage.status = :status', {
        status: query.status,
      });
    }

    if (query.search?.trim()) {
      queryBuilder.andWhere(
        `(
          storePackage.name ILIKE :search
          OR storePackage.description ILIKE :search
        )`,
        {
          search: `%${query.search.trim()}%`,
        },
      );
    }

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items: items.map((item) => this.mapPackage(item, true)),

      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPackageById(packageId: string) {
    const storePackage = await this.getPackageById(packageId);

    return this.mapPackage(storePackage, true);
  }

  async updatePackage(packageId: string, dto: UpdateStorePackageDto) {
    const current = await this.getPackageById(packageId);

    const normalized = this.normalizePackageValues(current.packageType, {
      priceEur: dto.priceEur ?? current.commerce.priceEur,

      billingModel: dto.billingModel ?? current.commerce.billingModel,

      voiceMinutes: dto.voiceMinutes ?? current.entitlement.voiceMinutes,

      textTokens: dto.textTokens ?? current.entitlement.textTokens,

      freezeCount: dto.freezeCount ?? current.entitlement.freezeCount,

      cvCreditCount: dto.cvCreditCount ?? current.entitlement.cvCreditCount,

      streakProtectionMode:
        dto.streakProtectionMode !== undefined
          ? dto.streakProtectionMode
          : current.entitlement.streakProtectionMode,

      protectionDurationDays:
        dto.protectionDurationDays !== undefined
          ? dto.protectionDurationDays
          : current.entitlement.protectionDurationDays,

      marketingBadge: dto.marketingBadge ?? current.commerce.marketingBadge,

      couponsEnabled: dto.couponsEnabled ?? current.commerce.couponsEnabled,

      couponCode:
        dto.couponCode !== undefined
          ? dto.couponCode
          : current.commerce.couponCode,

      googlePlayProductId:
        dto.googlePlayProductId !== undefined
          ? dto.googlePlayProductId
          : current.commerce.googlePlayProductId,

      stripePriceId:
        dto.stripePriceId !== undefined
          ? dto.stripePriceId
          : current.commerce.stripePriceId,
    });

    await this.dataSource.transaction(async (manager) => {
      const packageRepository = manager.getRepository(StorePackage);

      const commerceRepository = manager.getRepository(StorePackageCommerce);

      const entitlementRepository = manager.getRepository(
        StorePackageEntitlement,
      );

      if (dto.name !== undefined) {
        current.name = dto.name.trim();
      }

      if (dto.description !== undefined) {
        current.description = dto.description?.trim() || null;
      }

      if (dto.sortOrder !== undefined) {
        current.sortOrder = dto.sortOrder;
      }

      current.commerce.priceEur = normalized.priceEur;

      current.commerce.billingModel = normalized.billingModel;

      current.commerce.marketingBadge = normalized.marketingBadge;

      current.commerce.couponsEnabled = normalized.couponsEnabled;

      current.commerce.couponCode = normalized.couponCode;

      current.commerce.googlePlayProductId = normalized.googlePlayProductId;

      current.commerce.stripePriceId = normalized.stripePriceId;

      current.entitlement.voiceMinutes = normalized.voiceMinutes;

      current.entitlement.textTokens = normalized.textTokens;

      current.entitlement.freezeCount = normalized.freezeCount;

      current.entitlement.cvCreditCount = normalized.cvCreditCount;

      current.entitlement.streakProtectionMode =
        normalized.streakProtectionMode;

      current.entitlement.protectionDurationDays =
        normalized.protectionDurationDays;

      await packageRepository.save(current);

      await commerceRepository.save(current.commerce);

      await entitlementRepository.save(current.entitlement);
    });

    return this.findPackageById(packageId);
  }

  async archivePackage(packageId: string) {
    const storePackage = await this.getPackageById(packageId);

    storePackage.status = StorePackageStatus.ARCHIVED;

    storePackage.archivedAt = new Date();

    await this.packageRepository.save(storePackage);

    return {
      message: 'Package archived successfully.',
      packageId,
    };
  }

  async restorePackage(packageId: string) {
    const storePackage = await this.getPackageById(packageId);

    storePackage.status = StorePackageStatus.PUBLISHED;

    storePackage.publishedAt = storePackage.publishedAt ?? new Date();

    storePackage.archivedAt = null;

    await this.packageRepository.save(storePackage);

    return {
      message: 'Package restored successfully.',
      packageId,
    };
  }

  async reorderPackages(dto: ReorderStorePackagesDto) {
    const ids = dto.items.map((item) => item.packageId);

    const count = await this.packageRepository
      .createQueryBuilder('storePackage')
      .where('storePackage.id IN (:...ids)', {
        ids,
      })
      .getCount();

    if (count !== ids.length) {
      throw new BadRequestException('One or more packages were not found.');
    }

    await this.dataSource.transaction(async (manager) => {
      for (const item of dto.items) {
        await manager.update(StorePackage, item.packageId, {
          sortOrder: item.sortOrder,
        });
      }
    });

    return {
      message: 'Package order updated successfully.',
    };
  }

  // =========================================================
  // CV economy
  // =========================================================

  async getCvEconomyConfig() {
    return this.walletService.getOrCreateCvEconomyConfig();
  }

  async updateCvEconomyConfig(
    first: string | UpdateCvEconomyConfigDto,
    second?: string | UpdateCvEconomyConfigDto,
  ) {
    const adminUserId =
      typeof first === 'string'
        ? first
        : typeof second === 'string'
          ? second
          : null;

    const dto =
      typeof first === 'string' ? (second as UpdateCvEconomyConfigDto) : first;

    if (!dto) {
      throw new BadRequestException('CV economy configuration is required.');
    }

    const config = await this.walletService.getOrCreateCvEconomyConfig();

    config.freeCreditsPerSignup = dto.freeCreditsPerSignup;

    config.allowEditingWithoutCredit = dto.allowEditingWithoutCredit;

    config.updatedByAdminId = adminUserId;

    return this.configRepository.save(config);
  }

  // =========================================================
  // User shop
  // =========================================================

  async getShop(userId: string) {
    const [balances, packages, latestOrder] = await Promise.all([
      this.walletService.getBalances(userId),

      this.packageRepository.find({
        where: {
          status: StorePackageStatus.PUBLISHED,
        },
        relations: ['commerce', 'entitlement'],
      }),

      this.orderRepository.findOne({
        where: {
          userId,
        },
        order: {
          createdAt: 'DESC',
        },
      }),
    ]);

    const packageTypes = [
      StorePackageType.AI_BUNDLE,
      StorePackageType.CV_CREDIT,
      StorePackageType.STREAK_FREEZE,
    ];

    const sections = packageTypes.map((packageType) => {
      const matching = packages.filter(
        (item) => item.packageType === packageType,
      );

      const startingPrice =
        matching.length > 0
          ? matching
              .map((item) => Number(item.commerce.priceEur))
              .sort((left, right) => left - right)[0]
          : null;

      return {
        packageType,

        title:
          packageType === StorePackageType.AI_BUNDLE
            ? 'Refill AI Credits'
            : packageType === StorePackageType.CV_CREDIT
              ? 'CV Credit Pack'
              : 'Buy Streak Freeze',

        subtitle:
          packageType === StorePackageType.AI_BUNDLE
            ? 'Buy more minutes and tokens.'
            : packageType === StorePackageType.CV_CREDIT
              ? 'Generate and export professional resumes.'
              : 'Protect your learning streak.',

        packageCount: matching.length,

        startingPriceEur:
          startingPrice === null ? null : startingPrice.toFixed(2),
      };
    });

    return {
      balances,
      sections,

      orderHistory: {
        hasOrders: Boolean(latestOrder),
        latestOrderId: latestOrder?.id ?? null,

        latestOrderNumber: latestOrder?.orderNumber ?? null,

        latestOrderStatus: latestOrder?.status ?? null,
      },
    };
  }

  async getMyBalances(userId: string) {
    return this.walletService.getBalances(userId);
  }

  async findPublicPackages(query: PublicStorePackageQueryDto): Promise<{
    items: StorePackageResponse[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>;

  async findPublicPackages(
    userId: string,
    query: PublicStorePackageQueryDto,
  ): Promise<{
    balances: Awaited<ReturnType<StoreWalletService['getBalances']>>;
    items: StorePackageResponse[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>;

  async findPublicPackages(
    first: string | PublicStorePackageQueryDto,
    second?: PublicStorePackageQueryDto,
  ) {
    const userId = typeof first === 'string' ? first : null;

    const query = typeof first === 'string' ? (second ?? {}) : first;

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const sortBy = query.sortBy ?? StorePublicPackageSortBy.SORT_ORDER;

    const sortOrder = query.sortOrder ?? StoreSortOrder.ASC;

    const sortMap: Record<StorePublicPackageSortBy, string> = {
      [StorePublicPackageSortBy.SORT_ORDER]: 'storePackage.sortOrder',

      [StorePublicPackageSortBy.PRICE]: 'commerce.priceEur',

      [StorePublicPackageSortBy.NAME]: 'storePackage.name',

      [StorePublicPackageSortBy.CREATED_AT]: 'storePackage.createdAt',
    };

    const queryBuilder = this.packageRepository
      .createQueryBuilder('storePackage')
      .leftJoinAndSelect('storePackage.commerce', 'commerce')
      .leftJoinAndSelect('storePackage.entitlement', 'entitlement')
      .where('storePackage.status = :status', {
        status: StorePackageStatus.PUBLISHED,
      })
      .orderBy(sortMap[sortBy], sortOrder)
      .addOrderBy('storePackage.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.packageType) {
      queryBuilder.andWhere('storePackage.packageType = :packageType', {
        packageType: query.packageType,
      });
    }

    if (query.billingModel) {
      queryBuilder.andWhere('commerce.billingModel = :billingModel', {
        billingModel: query.billingModel,
      });
    }

    if (query.search?.trim()) {
      queryBuilder.andWhere(
        `(
          storePackage.name ILIKE :search
          OR storePackage.description ILIKE :search
        )`,
        {
          search: `%${query.search.trim()}%`,
        },
      );
    }

    const [items, total] = await queryBuilder.getManyAndCount();

    const result = {
      items: items.map((item) => this.mapPackage(item, false)),

      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    if (!userId) {
      return result;
    }

    return {
      balances: await this.walletService.getBalances(userId),

      ...result,
    };
  }

  async findPublicPackageById(packageId: string) {
    const storePackage = await this.getPublishedPackage(packageId);

    return this.mapPackage(storePackage, false);
  }

  // =========================================================
  // Quote
  // =========================================================

  async getQuote(
    userId: string,
    packageId: string,
    query: StorePackageQuoteQueryDto,
  ) {
    const storePackage = await this.getPublishedPackage(packageId);

    const currency = query.currency ?? CommerceCurrency.EUR;

    const quote = await this.calculateStoreQuote(
      storePackage,
      currency,
      query.couponCode,
    );

    return {
      package: this.mapPackage(storePackage, false),

      pricing: {
        baseCurrency: CommerceCurrency.EUR,

        selectedCurrency: quote.selectedCurrency,

        basePriceEur: quote.basePriceEur,

        originalAmount: quote.originalAmount,

        couponCode: quote.couponCode,

        discountPercentage: quote.discountPercentage,

        discountAmount: quote.discountAmount,

        payableAmount: quote.totalAmount,

        discountAmountEur: quote.discountAmountEur,

        payableAmountEur: quote.totalAmountEur,

        forexRate: quote.forexRate,
      },

      balances: await this.walletService.getBalances(userId),

      supportedProviders: [
        {
          provider: StorePaymentProvider.GOOGLE_PLAY,

          enabled: true,
          demo: this.isDemoMode(),
          demoProductId: this.isDemoMode()
            ? (storePackage.commerce.googlePlayProductId ??
              this.createDemoGoogleProductId(storePackage.id))
            : null,
        },
        {
          provider: StorePaymentProvider.STRIPE,

          enabled: true,
          demo: this.isDemoMode(),
          demoProductId: null,
        },
      ],
    };
  }

  // =========================================================
  // Order creation and checkout
  // =========================================================

  async createOrder(userId: string, dto: CreateStoreOrderDto) {
    const existingOrder = await this.orderRepository.findOne({
      where: {
        userId,
        idempotencyKey: dto.idempotencyKey,
      },
      relations: ['snapshot', 'pricing', 'payment', 'reversal', 'timeline'],
    });

    const selectedCurrency = dto.currency ?? CommerceCurrency.EUR;

    if (existingOrder) {
      if (
        existingOrder.packageId !== dto.packageId ||
        existingOrder.payment?.provider !== dto.paymentProvider ||
        existingOrder.pricing?.paymentCurrency !== selectedCurrency
      ) {
        throw new ConflictException(
          'The idempotency key is already assigned to another order request.',
        );
      }

      return this.mapOrder(existingOrder);
    }

    const storePackage = await this.getPublishedPackage(dto.packageId);

    const quote = await this.calculateStoreQuote(
      storePackage,
      selectedCurrency,
      dto.couponCode,
    );

    const orderId = await this.dataSource.transaction(async (manager) => {
      const orderRepository = manager.getRepository(StoreOrder);

      const snapshotRepository = manager.getRepository(
        StoreOrderPackageSnapshot,
      );

      const pricingRepository = manager.getRepository(StoreOrderPricing);

      const paymentRepository = manager.getRepository(StoreOrderPayment);

      const reversalRepository = manager.getRepository(StoreOrderReversal);

      const order = await orderRepository.save(
        orderRepository.create({
          orderNumber: this.generateOrderNumber(),

          userId,
          packageId: storePackage.id,

          idempotencyKey: dto.idempotencyKey,

          status: StoreOrderStatus.PENDING,
        }),
      );

      await snapshotRepository.save(
        snapshotRepository.create({
          orderId: order.id,

          packageType: storePackage.packageType,

          packageName: storePackage.name,

          packageDescription: storePackage.description,

          billingModel: storePackage.commerce.billingModel,

          marketingBadge: storePackage.commerce.marketingBadge,

          voiceMinutes: storePackage.entitlement.voiceMinutes,

          textTokens: storePackage.entitlement.textTokens,

          freezeCount: storePackage.entitlement.freezeCount,

          cvCreditCount: storePackage.entitlement.cvCreditCount,

          streakProtectionMode: storePackage.entitlement.streakProtectionMode,

          protectionDurationDays:
            storePackage.entitlement.protectionDurationDays,

          googlePlayProductId: storePackage.commerce.googlePlayProductId,

          stripePriceId: storePackage.commerce.stripePriceId,
        }),
      );

      await pricingRepository.save(
        pricingRepository.create({
          orderId: order.id,

          basePriceEur: quote.basePriceEur,

          couponCode: quote.couponCode,

          discountPercentage: quote.discountPercentage,

          discountAmountEur: quote.discountAmountEur,

          totalAmountEur: quote.totalAmountEur,

          paymentCurrency: quote.selectedCurrency,

          forexRate: quote.forexRate,

          paymentAmount: quote.totalAmount,
        }),
      );

      await paymentRepository.save(
        paymentRepository.create({
          orderId: order.id,

          provider: dto.paymentProvider,

          providerReference: null,

          failureCode: null,
          failureMessage: null,

          paidAt: null,
          refundedAt: null,
          refundReason: null,
        }),
      );

      await reversalRepository.save(
        reversalRepository.create({
          orderId: order.id,

          reversedVoiceMinutes: 0,
          reversedTextTokens: 0,
          reversedFreezeCount: 0,
          reversedCvCredits: 0,

          unlimitedProtectionPreviousUntil: null,

          unlimitedProtectionGrantedUntil: null,
        }),
      );

      await this.addTimelineEvent(
        manager,
        order.id,
        StoreTimelineEventType.ORDER_PLACED,
        'Order placed',
        'The package checkout order was created.',
        {
          packageId: storePackage.id,

          paymentProvider: dto.paymentProvider,

          currency: quote.selectedCurrency,

          paymentAmount: quote.totalAmount,
        },
      );

      return order.id;
    });

    return this.findOwnedOrderById(userId, orderId);
  }

  async getCheckout(userId: string, orderId: string) {
    const order = await this.getOwnedOrderGraph(userId, orderId);

    if (order.status !== StoreOrderStatus.PENDING) {
      throw new BadRequestException(
        `Checkout is unavailable for an order with status ${order.status}.`,
      );
    }

    return {
      order: this.mapOrder(order),

      paymentMethods: [
        {
          method: 'google_play',

          provider: StorePaymentProvider.GOOGLE_PLAY,

          label: 'Google Play',

          enabled: true,
          demo: this.isDemoMode(),

          unavailableReason: null,
          demoProductId: this.isDemoMode()
            ? (order.snapshot.googlePlayProductId ??
              this.createDemoGoogleProductId(order.packageId))
            : null,
        },
        {
          method: 'card',

          provider: StorePaymentProvider.STRIPE,

          label: 'Card',

          enabled: true,
          demo: this.isDemoMode(),

          unavailableReason: null,
          demoProductId: null,
        },
        {
          method: 'paypal',
          provider: null,

          label: 'PayPal',

          enabled: false,
          demo: false,

          unavailableReason: 'PayPal is not configured.',
        },
        {
          method: 'apple_pay',
          provider: null,

          label: 'Apple Pay',

          enabled: false,
          demo: false,

          unavailableReason: 'Apple Pay is not configured.',
        },
        {
          method: 'bkash',
          provider: null,

          label: 'Bkash',

          enabled: false,
          demo: false,

          unavailableReason: 'Bkash is not configured.',
        },
      ],
    };
  }

  // =========================================================
  // Demo payment confirmation
  // =========================================================

  async confirmGooglePlayDemo(params: {
    userId: string;
    orderId: string;
    dto: ConfirmStoreGooglePlayDemoDto;
  }) {
    this.assertDemoMode();

    const order = await this.getOwnedOrderGraph(params.userId, params.orderId);

    if (order.payment.provider !== StorePaymentProvider.GOOGLE_PLAY) {
      throw new BadRequestException(
        'This order was not created for Google Play.',
      );
    }

    const configuredProductId = order.snapshot.googlePlayProductId;

    const expectedProductId =
      configuredProductId || this.createDemoGoogleProductId(order.packageId);

    if (params.dto.productId !== expectedProductId) {
      throw new BadRequestException(
        'Google Play product ID does not match the ordered package.',
      );
    }

    const providerReference = `google-play:${createHash('sha256')
      .update(params.dto.purchaseToken)
      .digest('hex')}`;

    return this.completeOrder({
      userId: params.userId,
      orderId: params.orderId,
      provider: StorePaymentProvider.GOOGLE_PLAY,
      providerReference,
    });
  }

  async confirmStripeDemo(params: {
    userId: string;
    orderId: string;
    dto: ConfirmStoreStripeDemoDto;
  }) {
    this.assertDemoMode();

    const order = await this.getOwnedOrderGraph(params.userId, params.orderId);

    if (order.payment.provider !== StorePaymentProvider.STRIPE) {
      throw new BadRequestException('This order was not created for Stripe.');
    }

    if (params.dto.demoResult === 'failed') {
      return this.failOrder({
        userId: params.userId,
        orderId: params.orderId,

        providerReference: params.dto.paymentIntentId,

        failureCode: 'demo_payment_failed',

        failureMessage: 'The demo Stripe payment was configured to fail.',
      });
    }

    return this.completeOrder({
      userId: params.userId,
      orderId: params.orderId,

      provider: StorePaymentProvider.STRIPE,

      providerReference: params.dto.paymentIntentId,
    });
  }

  // =========================================================
  // User order APIs
  // =========================================================

  async findOwnedOrderById(userId: string, orderId: string) {
    const order = await this.getOwnedOrderGraph(userId, orderId);

    return this.mapOrder(order);
  }

  async findPurchaseHistory(userId: string, query: StoreOrderHistoryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const category = query.category ?? PurchaseHistoryCategory.ALL;

    const sortBy = query.sortBy ?? PurchaseHistorySortBy.PURCHASED_AT;

    const sortOrder = query.sortOrder ?? StoreSortOrder.DESC;

    const [storeOrders, rawCourseOrders] = await Promise.all([
      this.orderRepository.find({
        where: {
          userId,
        },
        relations: ['snapshot', 'pricing', 'payment'],
      }),

      this.courseOrderRepository.find({
        where: {
          userId,
        },
      }),
    ]);

    const storeItems = storeOrders.map((order) => ({
      id: order.id,

      orderNumber: order.orderNumber,

      category: this.getPackageHistoryCategory(order.snapshot.packageType),

      name: order.snapshot.packageName,

      status: order.status,

      paymentProvider: order.payment.provider,

      currency: order.pricing.paymentCurrency,

      amount: order.pricing.paymentAmount,

      amountEur: order.pricing.totalAmountEur,

      purchasedAt: order.payment.paidAt ?? order.createdAt,

      iconType: order.snapshot.packageType,

      source: 'package_store' as const,
    }));

    const courseItems = rawCourseOrders.map((rawOrder) => {
      const order = rawOrder as unknown as CourseHistoryRecord;

      const amountEur =
        order.payableAmountEur ?? order.totalAmountEur ?? '0.00';

      const paymentAmount = order.paymentAmount ?? amountEur;

      return {
        id: order.id,

        orderNumber: order.orderNumber,

        category: PurchaseHistoryCategory.COURSE,

        name:
          order.courseTitleSnapshot ??
          order.courseNameSnapshot ??
          'Course Purchase',

        status: this.mapExternalOrderStatus(order.status),

        paymentProvider: order.paymentProvider ?? null,

        currency: order.paymentCurrency ?? CommerceCurrency.EUR,

        amount: paymentAmount,

        amountEur,

        purchasedAt: order.paidAt ?? order.createdAt,

        iconType: 'course',

        source: 'course_commerce' as const,
      };
    });

    let filtered = [...storeItems, ...courseItems];

    if (query.status) {
      filtered = filtered.filter((item) => item.status === query.status);
    }

    if (query.paymentProvider) {
      filtered = filtered.filter(
        (item) => item.paymentProvider === query.paymentProvider,
      );
    }

    if (query.search?.trim()) {
      const search = query.search.trim().toLowerCase();

      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(search) ||
          item.orderNumber.toLowerCase().includes(search),
      );
    }

    if (query.dateFrom) {
      const dateFrom = new Date(query.dateFrom);

      filtered = filtered.filter(
        (item) => new Date(item.purchasedAt) >= dateFrom,
      );
    }

    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);

      dateTo.setUTCHours(23, 59, 59, 999);

      filtered = filtered.filter(
        (item) => new Date(item.purchasedAt) <= dateTo,
      );
    }

    const counts = {
      all: filtered.length,

      course: filtered.filter(
        (item) => item.category === PurchaseHistoryCategory.COURSE,
      ).length,

      aiRefill: filtered.filter(
        (item) => item.category === PurchaseHistoryCategory.AI_REFILL,
      ).length,

      streakFreeze: filtered.filter(
        (item) => item.category === PurchaseHistoryCategory.STREAK_FREEZE,
      ).length,

      cvCredit: filtered.filter(
        (item) => item.category === PurchaseHistoryCategory.CV_CREDIT,
      ).length,
    };

    if (category !== PurchaseHistoryCategory.ALL) {
      filtered = filtered.filter((item) => item.category === category);
    }

    filtered.sort((left, right) => {
      let comparison = 0;

      if (sortBy === PurchaseHistorySortBy.PURCHASED_AT) {
        comparison =
          new Date(left.purchasedAt).getTime() -
          new Date(right.purchasedAt).getTime();
      }

      if (sortBy === PurchaseHistorySortBy.AMOUNT) {
        comparison = Number(left.amountEur) - Number(right.amountEur);
      }

      if (sortBy === PurchaseHistorySortBy.NAME) {
        comparison = left.name.localeCompare(right.name);
      }

      return sortOrder === StoreSortOrder.ASC ? comparison : -comparison;
    });

    const total = filtered.length;
    const offset = (page - 1) * limit;

    const items = filtered.slice(offset, offset + limit).map((item) => ({
      ...item,

      formattedAmount: this.formatCurrencyAmount(item.amount, item.currency),
    }));

    return {
      items,
      filters: counts,

      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getOwnedInvoice(userId: string, orderId: string) {
    const order = await this.getOwnedOrderGraph(userId, orderId);

    if (
      order.status !== StoreOrderStatus.COMPLETED &&
      order.status !== StoreOrderStatus.REFUNDED
    ) {
      throw new BadRequestException(
        'An invoice is only available for a completed or refunded order.',
      );
    }

    return this.buildInvoice(order);
  }

  // =========================================================
  // Admin orders
  // =========================================================

  async findAdminOrders(query: AdminStoreOrderQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const queryBuilder = this.buildAdminOrderQuery(query);

    const [items, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: items.map((item) => this.mapOrder(item)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async exportOrdersCsv(query: AdminStoreOrderQueryDto): Promise<string> {
    const orders = await this.buildAdminOrderQuery(query).getMany();

    const header = [
      'Order ID',
      'Order Number',
      'Customer Name',
      'Customer Email',
      'Package Name',
      'Package Type',
      'Billing Model',
      'Payment Provider',
      'Currency',
      'Amount Paid',
      'Amount EUR',
      'Coupon Code',
      'Discount Percentage',
      'Status',
      'Order Date',
      'Paid Date',
      'Refunded Date',
    ];

    const rows = orders.map((order) => {
      const user = order.user as unknown as {
        firstName?: string;
        lastName?: string;
        name?: string;
        email?: string;
      };

      const customerName =
        user?.name ||
        [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
        '';

      return [
        order.id,
        order.orderNumber,
        customerName,
        user?.email ?? '',
        order.snapshot.packageName,
        order.snapshot.packageType,
        order.snapshot.billingModel,
        order.payment.provider,
        order.pricing.paymentCurrency,
        order.pricing.paymentAmount,
        order.pricing.totalAmountEur,
        order.pricing.couponCode ?? '',
        order.pricing.discountPercentage,
        order.status,
        order.createdAt.toISOString(),
        order.payment.paidAt?.toISOString() ?? '',
        order.payment.refundedAt?.toISOString() ?? '',
      ];
    });

    const csvLines = [
      header.map((value) => this.escapeCsvCell(value)).join(','),
      ...rows.map((row) =>
        row.map((value) => this.escapeCsvCell(value)).join(','),
      ),
    ];

    // UTF-8 BOM lets Excel display Unicode text correctly.
    return `\uFEFF${csvLines.join('\r\n')}`;
  }

  private buildAdminOrderQuery(
    query: AdminStoreOrderQueryDto,
  ): SelectQueryBuilder<StoreOrder> {
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? StoreSortOrder.DESC;

    const sortMap: Record<
      NonNullable<AdminStoreOrderQueryDto['sortBy']>,
      string
    > = {
      createdAt: 'storeOrder.createdAt',
      totalAmountEur: 'pricing.totalAmountEur',
      orderNumber: 'storeOrder.orderNumber',
    };

    const queryBuilder = this.orderRepository
      .createQueryBuilder('storeOrder')
      .leftJoinAndSelect('storeOrder.snapshot', 'snapshot')
      .leftJoinAndSelect('storeOrder.pricing', 'pricing')
      .leftJoinAndSelect('storeOrder.payment', 'payment')
      .leftJoinAndSelect('storeOrder.reversal', 'reversal')
      .leftJoinAndSelect('storeOrder.user', 'user')
      .orderBy(sortMap[sortBy], sortOrder)
      .addOrderBy('storeOrder.id', 'ASC');

    if (query.search?.trim()) {
      queryBuilder.andWhere(
        `(
        storeOrder.orderNumber ILIKE :search
        OR snapshot.packageName ILIKE :search
        OR user.email ILIKE :search
        OR user.fulltName ILIKE :search
      )`,
        {
          search: `%${query.search.trim()}%`,
        },
      );
    }

    if (query.packageType) {
      queryBuilder.andWhere('snapshot.packageType = :packageType', {
        packageType: query.packageType,
      });
    }

    if (query.status) {
      queryBuilder.andWhere('storeOrder.status = :status', {
        status: query.status,
      });
    }

    if (query.paymentProvider) {
      queryBuilder.andWhere('payment.provider = :paymentProvider', {
        paymentProvider: query.paymentProvider,
      });
    }

    if (query.dateFrom) {
      queryBuilder.andWhere('storeOrder.createdAt >= :dateFrom', {
        dateFrom: new Date(query.dateFrom),
      });
    }

    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);

      dateTo.setUTCHours(23, 59, 59, 999);

      queryBuilder.andWhere('storeOrder.createdAt <= :dateTo', {
        dateTo,
      });
    }

    return queryBuilder;
  }

  private escapeCsvCell(
    value: string | number | boolean | null | undefined,
  ): string {
    if (value === null || value === undefined) {
      return '""';
    }

    const normalized = String(value).replace(/"/g, '""');

    return `"${normalized}"`;
  }

  async findAdminOrderById(orderId: string) {
    const order = await this.getOrderGraph(orderId);

    return this.mapOrder(order);
  }

  async refundOrder(orderId: string, dto: RefundStoreOrderDto) {
    await this.dataSource.transaction(async (manager) => {
      const order = await this.getOrderGraphWithManager(manager, orderId);

      if (order.status !== StoreOrderStatus.COMPLETED) {
        throw new BadRequestException('Only completed orders can be refunded.');
      }

      await this.walletService.reverseOrder(order, manager);

      order.status = StoreOrderStatus.REFUNDED;

      order.payment.refundedAt = new Date();

      order.payment.refundReason = dto.reason?.trim() || null;

      await manager.getRepository(StoreOrder).save(order);

      await manager.getRepository(StoreOrderPayment).save(order.payment);

      await this.addTimelineEvent(
        manager,
        order.id,

        StoreTimelineEventType.REFUND_PROCESSED,

        'Refund processed',

        dto.reason?.trim() || 'The order was refunded.',

        {
          reversedVoiceMinutes: order.reversal.reversedVoiceMinutes,

          reversedTextTokens: order.reversal.reversedTextTokens,

          reversedFreezeCount: order.reversal.reversedFreezeCount,

          reversedCvCredits: order.reversal.reversedCvCredits,
        },
      );
    });

    return this.findAdminOrderById(orderId);
  }

  async demoRefund(orderId: string, dto?: RefundStoreOrderDto) {
    this.assertDemoMode();

    return this.refundOrder(orderId, {
      reason: dto?.reason?.trim() || 'Demo refund',
    });
  }

  async getAdminInvoice(orderId: string) {
    const order = await this.getOrderGraph(orderId);

    return this.buildInvoice(order);
  }

  // Compatibility aliases
  async findOrders(query: AdminStoreOrderQueryDto) {
    return this.findAdminOrders(query);
  }

  async findOrderById(orderId: string) {
    return this.findAdminOrderById(orderId);
  }

  // =========================================================
  // Internal order processing
  // =========================================================

  private async completeOrder(params: {
    userId: string;
    orderId: string;
    provider: StorePaymentProvider;
    providerReference: string;
  }) {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.getOrderGraphWithManager(
        manager,
        params.orderId,
        params.userId,
      );

      if (order.status === StoreOrderStatus.COMPLETED) {
        const balances = await this.walletService.getBalances(params.userId);

        return this.buildCompletionResponse(order, balances);
      }

      if (order.status !== StoreOrderStatus.PENDING) {
        throw new BadRequestException(
          `Order cannot be completed from status ${order.status}.`,
        );
      }

      if (order.payment.provider !== params.provider) {
        throw new BadRequestException(
          'Payment provider does not match the order.',
        );
      }

      const duplicatePayment = await manager
        .getRepository(StoreOrderPayment)
        .findOne({
          where: {
            provider: params.provider,

            providerReference: params.providerReference,
          },
        });

      if (duplicatePayment && duplicatePayment.orderId !== order.id) {
        throw new ConflictException(
          'This payment reference has already been used.',
        );
      }

      order.status = StoreOrderStatus.COMPLETED;

      order.payment.providerReference = params.providerReference;

      order.payment.failureCode = null;
      order.payment.failureMessage = null;
      order.payment.paidAt = new Date();

      await manager.getRepository(StoreOrder).save(order);

      await manager.getRepository(StoreOrderPayment).save(order.payment);

      await this.addTimelineEvent(
        manager,
        order.id,

        StoreTimelineEventType.PAYMENT_PROCESSED,

        'Payment processed',

        'The payment was completed successfully.',

        {
          provider: params.provider,

          providerReference: params.providerReference,
        },
      );

      const balances = await this.walletService.grantOrder(order, manager);

      await this.addTimelineEvent(
        manager,
        order.id,

        StoreTimelineEventType.ENTITLEMENT_GRANTED,

        'Package resources credited',

        'The purchased package resources were added to the user balance.',

        {
          voiceMinutes: order.snapshot.voiceMinutes ?? 0,

          textTokens: order.snapshot.textTokens ?? 0,

          freezeCount: order.snapshot.freezeCount ?? 0,

          cvCreditCount: order.snapshot.cvCreditCount ?? 0,

          streakProtectionMode: order.snapshot.streakProtectionMode,
        },
      );

      return this.buildCompletionResponse(order, balances);
    });
  }

  private async failOrder(params: {
    userId: string;
    orderId: string;
    providerReference: string;
    failureCode: string;
    failureMessage: string;
  }) {
    await this.dataSource.transaction(async (manager) => {
      const order = await this.getOrderGraphWithManager(
        manager,
        params.orderId,
        params.userId,
      );

      if (order.status !== StoreOrderStatus.PENDING) {
        throw new BadRequestException(
          `Order cannot fail from status ${order.status}.`,
        );
      }

      order.status = StoreOrderStatus.FAILED;

      order.payment.providerReference = params.providerReference;

      order.payment.failureCode = params.failureCode;

      order.payment.failureMessage = params.failureMessage;

      await manager.getRepository(StoreOrder).save(order);

      await manager.getRepository(StoreOrderPayment).save(order.payment);

      await this.addTimelineEvent(
        manager,
        order.id,

        StoreTimelineEventType.PAYMENT_FAILED,

        'Payment failed',

        params.failureMessage,

        {
          failureCode: params.failureCode,

          providerReference: params.providerReference,
        },
      );
    });

    return this.findOwnedOrderById(params.userId, params.orderId);
  }

  // =========================================================
  // Package normalization
  // =========================================================

  private normalizePackageValues(
    packageType: StorePackageType,
    input: PackageNormalizationInput,
  ): NormalizedPackageValues {
    const priceEur = this.formatMoney(
      this.parseMoney(input.priceEur, 'Package price'),
    );

    const billingModel = input.billingModel ?? StoreBillingModel.ONE_TIME;

    const marketingBadge = input.marketingBadge ?? StoreMarketingBadge.NONE;

    const couponsEnabled = input.couponsEnabled ?? false;

    let couponCode: string | null = null;

    if (couponsEnabled) {
      couponCode = input.couponCode?.trim().toUpperCase() || null;

      if (!couponCode) {
        throw new BadRequestException(
          'Coupon code is required when coupons are enabled.',
        );
      }

      this.parseCouponPercentage(couponCode);
    }

    let voiceMinutes: number | null = null;

    let textTokens: number | null = null;

    let freezeCount: number | null = null;

    let cvCreditCount: number | null = null;

    let streakProtectionMode: StreakProtectionMode | null = null;

    let protectionDurationDays: number | null = null;

    if (packageType === StorePackageType.AI_BUNDLE) {
      if (!input.voiceMinutes || input.voiceMinutes < 1) {
        throw new BadRequestException('AI bundles require voiceMinutes.');
      }

      if (!input.textTokens || input.textTokens < 1) {
        throw new BadRequestException('AI bundles require textTokens.');
      }

      voiceMinutes = input.voiceMinutes;

      textTokens = input.textTokens;
    }

    if (packageType === StorePackageType.CV_CREDIT) {
      if (!input.cvCreditCount || input.cvCreditCount < 1) {
        throw new BadRequestException(
          'CV credit packages require cvCreditCount.',
        );
      }

      cvCreditCount = input.cvCreditCount;
    }

    if (packageType === StorePackageType.STREAK_FREEZE) {
      streakProtectionMode =
        input.streakProtectionMode ?? StreakProtectionMode.FINITE;

      if (streakProtectionMode === StreakProtectionMode.FINITE) {
        if (!input.freezeCount || input.freezeCount < 1) {
          throw new BadRequestException(
            'Finite streak-freeze packages require freezeCount.',
          );
        }

        if (billingModel !== StoreBillingModel.ONE_TIME) {
          throw new BadRequestException(
            'Finite streak freezes must use one-time billing.',
          );
        }

        freezeCount = input.freezeCount;
      }

      if (streakProtectionMode === StreakProtectionMode.MONTHLY_UNLIMITED) {
        if (billingModel !== StoreBillingModel.MONTHLY) {
          throw new BadRequestException(
            'Unlimited streak protection must use monthly billing.',
          );
        }

        protectionDurationDays = input.protectionDurationDays ?? 30;

        if (protectionDurationDays < 1 || protectionDurationDays > 365) {
          throw new BadRequestException(
            'Protection duration must be between 1 and 365 days.',
          );
        }
      }
    }

    return {
      priceEur,
      billingModel,
      marketingBadge,
      couponsEnabled,
      couponCode,

      googlePlayProductId: input.googlePlayProductId?.trim() || null,

      stripePriceId: input.stripePriceId?.trim() || null,

      voiceMinutes,
      textTokens,
      freezeCount,
      cvCreditCount,
      streakProtectionMode,
      protectionDurationDays,
    };
  }

  // =========================================================
  // Quote calculation
  // =========================================================

  private async calculateStoreQuote(
    storePackage: StorePackage,
    currency: CommerceCurrency,
    suppliedCouponCode?: string,
  ): Promise<StoreQuote> {
    const basePriceMinor = this.parseMoney(
      storePackage.commerce.priceEur,
      'Package price',
    );

    const coupon = this.resolveStoreCoupon(storePackage, suppliedCouponCode);

    const discountMinor = this.percentageAmount(
      basePriceMinor,
      coupon.percentage,
    );

    const totalMinor = basePriceMinor - discountMinor;

    const basePriceEur = this.formatMoney(basePriceMinor);

    const discountAmountEur = this.formatMoney(discountMinor);

    const totalAmountEur = this.formatMoney(totalMinor);

    if (currency === CommerceCurrency.EUR) {
      return {
        basePriceEur,

        couponCode: coupon.code,

        discountPercentage: coupon.percentage,

        discountAmountEur,
        totalAmountEur,

        selectedCurrency: CommerceCurrency.EUR,

        forexRate: null,

        originalAmount: basePriceEur,

        discountAmount: discountAmountEur,

        totalAmount: totalAmountEur,
      };
    }

    let forexRate: string;

    try {
      forexRate = await this.forexRateProvider.getEurToBdtRate();
    } catch {
      throw new ServiceUnavailableException(
        'The EUR to BDT exchange rate is temporarily unavailable.',
      );
    }

    const numericRate = Number(forexRate);

    if (!Number.isFinite(numericRate) || numericRate <= 0) {
      throw new ServiceUnavailableException(
        'The forex provider returned an invalid exchange rate.',
      );
    }

    const originalBdtMinor = Math.round(basePriceMinor * numericRate);

    const totalBdtMinor = Math.round(totalMinor * numericRate);

    const discountBdtMinor = originalBdtMinor - totalBdtMinor;

    return {
      basePriceEur,

      couponCode: coupon.code,

      discountPercentage: coupon.percentage,

      discountAmountEur,
      totalAmountEur,

      selectedCurrency: CommerceCurrency.BDT,

      forexRate: numericRate.toFixed(4),

      originalAmount: this.formatMoney(originalBdtMinor),

      discountAmount: this.formatMoney(discountBdtMinor),

      totalAmount: this.formatMoney(totalBdtMinor),
    };
  }

  private resolveStoreCoupon(
    storePackage: StorePackage,
    suppliedCouponCode?: string,
  ): AppliedPackageCoupon {
    if (!suppliedCouponCode?.trim()) {
      return {
        code: null,
        percentage: 0,
      };
    }

    if (!storePackage.commerce.couponsEnabled) {
      throw new BadRequestException(
        'Coupons are not enabled for this package.',
      );
    }

    const configuredCode = storePackage.commerce.couponCode
      ?.trim()
      .toUpperCase();

    const suppliedCode = suppliedCouponCode.trim().toUpperCase();

    if (!configuredCode || configuredCode !== suppliedCode) {
      throw new BadRequestException('Coupon code is invalid for this package.');
    }

    return {
      code: configuredCode,

      percentage: this.parseCouponPercentage(configuredCode),
    };
  }

  private parseCouponPercentage(code: string): number {
    const match = code
      .trim()
      .toUpperCase()
      .match(/(\d{2})$/);

    if (!match) {
      throw new BadRequestException(
        'Coupon code must end with a two-digit percentage.',
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

  // =========================================================
  // Mapping
  // =========================================================

  private mapPackage(
    storePackage: StorePackage,
    includePrivateFields: boolean,
  ): StorePackageResponse & {
    status?: StorePackageStatus;
    publishedAt?: Date | null;
    archivedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
    googlePlayProductId?: string | null;
    stripePriceId?: string | null;
  } {
    const result = {
      id: storePackage.id,

      type: storePackage.packageType,

      name: storePackage.name,

      description: storePackage.description,

      priceEur: this.formatMoney(
        this.parseMoney(storePackage.commerce.priceEur, 'Package price'),
      ),

      billingModel: storePackage.commerce.billingModel,

      marketingBadge: storePackage.commerce.marketingBadge,

      aiVoiceMinutes: storePackage.entitlement.voiceMinutes ?? 0,

      aiTextTokens: storePackage.entitlement.textTokens ?? 0,

      cvCredits: storePackage.entitlement.cvCreditCount ?? 0,

      streakFreezeCount: storePackage.entitlement.freezeCount ?? 0,

      streakProtectionMode: storePackage.entitlement.streakProtectionMode,

      protectionDurationDays: storePackage.entitlement.protectionDurationDays,

      couponEnabled: storePackage.commerce.couponsEnabled,

      couponCode: includePrivateFields
        ? storePackage.commerce.couponCode
        : null,

      sortOrder: storePackage.sortOrder,
    };

    if (!includePrivateFields) {
      return result;
    }

    return {
      ...result,

      status: storePackage.status,

      publishedAt: storePackage.publishedAt,

      archivedAt: storePackage.archivedAt,

      createdAt: storePackage.createdAt,

      updatedAt: storePackage.updatedAt,

      googlePlayProductId: storePackage.commerce.googlePlayProductId,

      stripePriceId: storePackage.commerce.stripePriceId,
    };
  }

  private mapOrder(order: StoreOrder) {
    const timeline = [...(order.timeline ?? [])].sort(
      (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
    );

    const rawUser = order.user as unknown as {
      id?: string;
      firstName?: string;
      lastName?: string;
      name?: string;
      email?: string;
      studentId?: string;
    };

    const displayName =
      rawUser?.name ||
      [rawUser?.firstName, rawUser?.lastName].filter(Boolean).join(' ') ||
      null;

    return {
      id: order.id,

      orderNumber: order.orderNumber,

      status: order.status,

      user: order.user
        ? {
            id: rawUser.id ?? order.userId,

            name: displayName,

            email: rawUser.email ?? null,

            studentId: rawUser.studentId ?? null,
          }
        : null,

      package: {
        id: order.packageId,

        type: order.snapshot.packageType,

        name: order.snapshot.packageName,

        description: order.snapshot.packageDescription,

        billingModel: order.snapshot.billingModel,

        marketingBadge: order.snapshot.marketingBadge,

        entitlements: {
          voiceMinutes: order.snapshot.voiceMinutes ?? 0,

          textTokens: order.snapshot.textTokens ?? 0,

          streakFreezes: order.snapshot.freezeCount ?? 0,

          cvCredits: order.snapshot.cvCreditCount ?? 0,

          streakProtectionMode: order.snapshot.streakProtectionMode,

          protectionDurationDays: order.snapshot.protectionDurationDays,
        },
      },

      pricing: {
        currency: order.pricing.paymentCurrency,

        packagePriceEur: order.pricing.basePriceEur,

        couponCode: order.pricing.couponCode,

        discountPercentage: order.pricing.discountPercentage,

        discountAmountEur: order.pricing.discountAmountEur,

        totalAmountEur: order.pricing.totalAmountEur,

        paymentAmount: order.pricing.paymentAmount,

        formattedPaymentAmount: this.formatCurrencyAmount(
          order.pricing.paymentAmount,

          order.pricing.paymentCurrency,
        ),

        forexRate: order.pricing.forexRate,
      },

      payment: {
        provider: order.payment.provider,

        providerReference: order.payment.providerReference,

        failureCode: order.payment.failureCode,

        failureMessage: order.payment.failureMessage,

        paidAt: order.payment.paidAt,

        refundedAt: order.payment.refundedAt,

        refundReason: order.payment.refundReason,
      },

      reversal: {
        voiceMinutes: order.reversal.reversedVoiceMinutes,

        textTokens: order.reversal.reversedTextTokens,

        freezeCount: order.reversal.reversedFreezeCount,

        cvCredits: order.reversal.reversedCvCredits,

        unlimitedProtectionGrantedUntil:
          order.reversal.unlimitedProtectionGrantedUntil,
      },

      timeline: timeline.map((item) => ({
        id: item.id,

        eventType: item.eventType,

        title: item.title,

        description: item.description,

        metadata: item.metadata,

        occurredAt: item.occurredAt,
      })),

      createdAt: order.createdAt,

      updatedAt: order.updatedAt,
    };
  }

  private buildCompletionResponse(
    order: StoreOrder,
    balances: Awaited<ReturnType<StoreWalletService['getBalances']>>,
  ) {
    return {
      message: 'Package purchase completed successfully.',

      order: {
        id: order.id,

        orderNumber: order.orderNumber,

        status: order.status,

        package: {
          id: order.packageId,

          type: order.snapshot.packageType,

          name: order.snapshot.packageName,

          billingModel: order.snapshot.billingModel,
        },

        payment: {
          provider: order.payment.provider,

          currency: order.pricing.paymentCurrency,

          amount: order.pricing.paymentAmount,

          amountEur: order.pricing.totalAmountEur,

          providerReference: order.payment.providerReference,
        },

        completedAt: order.payment.paidAt,
      },

      credited: {
        voiceMinutes: order.snapshot.voiceMinutes ?? 0,

        textTokens: order.snapshot.textTokens ?? 0,

        streakFreezes: order.snapshot.freezeCount ?? 0,

        cvCredits: order.snapshot.cvCreditCount ?? 0,

        streakProtectionMode: order.snapshot.streakProtectionMode,

        unlimitedProtectionUntil:
          order.reversal.unlimitedProtectionGrantedUntil,
      },

      balances,
    };
  }

  // =========================================================
  // Entity loading
  // =========================================================

  private async getPackageById(packageId: string) {
    const storePackage = await this.packageRepository.findOne({
      where: {
        id: packageId,
      },
      relations: ['commerce', 'entitlement'],
    });

    if (!storePackage || !storePackage.commerce || !storePackage.entitlement) {
      throw new NotFoundException('Package not found.');
    }

    return storePackage;
  }

  private async getPublishedPackage(packageId: string) {
    const storePackage = await this.packageRepository.findOne({
      where: {
        id: packageId,

        status: StorePackageStatus.PUBLISHED,
      },
      relations: ['commerce', 'entitlement'],
    });

    if (!storePackage || !storePackage.commerce || !storePackage.entitlement) {
      throw new NotFoundException('Published package not found.');
    }

    return storePackage;
  }

  private async getOwnedOrderGraph(userId: string, orderId: string) {
    const order = await this.orderRepository.findOne({
      where: {
        id: orderId,
        userId,
      },
      relations: [
        'snapshot',
        'pricing',
        'payment',
        'reversal',
        'timeline',
        'package',
        'user',
      ],
    });

    if (!order) {
      throw new NotFoundException('Store order not found.');
    }

    this.assertOrderRelations(order);

    return order;
  }

  private async getOrderGraph(orderId: string) {
    const order = await this.orderRepository.findOne({
      where: {
        id: orderId,
      },
      relations: [
        'snapshot',
        'pricing',
        'payment',
        'reversal',
        'timeline',
        'package',
        'user',
      ],
    });

    if (!order) {
      throw new NotFoundException('Store order not found.');
    }

    this.assertOrderRelations(order);

    return order;
  }

  private async getOrderGraphWithManager(
    manager: EntityManager,
    orderId: string,
    userId?: string,
  ) {
    const orderRepository = manager.getRepository(StoreOrder);
    const lockQuery = orderRepository
      .createQueryBuilder('storeOrder')
      .select('storeOrder.id')
      .where('storeOrder.id = :orderId', { orderId })
      .setLock('pessimistic_write');

    if (userId) {
      lockQuery.andWhere('storeOrder.userId = :userId', { userId });
    }

    // Lock only the root order row. PostgreSQL cannot apply FOR UPDATE to
    // nullable rows produced by the LEFT JOIN relations below.
    const lockedOrder = await lockQuery.getOne();

    if (!lockedOrder) {
      throw new NotFoundException('Store order not found.');
    }

    const order = await orderRepository.findOne({
      where: userId
        ? { id: lockedOrder.id, userId }
        : { id: lockedOrder.id },
      relations: [
        'snapshot',
        'pricing',
        'payment',
        'reversal',
        'timeline',
        'package',
        'user',
      ],
    });

    if (!order) {
      throw new NotFoundException('Store order not found.');
    }

    this.assertOrderRelations(order);

    return order;
  }

  private assertOrderRelations(order: StoreOrder): void {
    if (
      !order.snapshot ||
      !order.pricing ||
      !order.payment ||
      !order.reversal
    ) {
      throw new ConflictException(
        'The store order is missing required related records.',
      );
    }
  }

  // =========================================================
  // Timeline
  // =========================================================

  private async addTimelineEvent(
    manager: EntityManager,
    orderId: string,
    eventType: StoreTimelineEventType,
    title: string,
    description: string | null,
    metadata?: Record<string, unknown>,
  ) {
    const repository = manager.getRepository(StoreOrderTimelineEvent);

    return repository.save(
      repository.create({
        orderId,
        eventType,
        title,
        description,

        metadata: metadata ?? null,

        occurredAt: new Date(),
      }),
    );
  }

  // =========================================================
  // Invoice
  // =========================================================

  private buildInvoice(order: StoreOrder) {
    const packageName = this.escapeHtml(order.snapshot.packageName);

    const couponRow =
      order.pricing.discountPercentage > 0
        ? `
          <tr>
            <th>
              Coupon ${
                order.pricing.couponCode
                  ? `(${this.escapeHtml(order.pricing.couponCode)})`
                  : ''
              }
            </th>

            <td class="right">
              -€${order.pricing.discountAmountEur}
            </td>
          </tr>
        `
        : '';

    const html = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />

          <title>
            Invoice ${this.escapeHtml(order.orderNumber)}
          </title>

          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 40px;
              color: #1f2937;
            }

            .header {
              margin-bottom: 32px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 24px;
            }

            th,
            td {
              padding: 12px;
              border-bottom: 1px solid #e5e7eb;
              text-align: left;
            }

            .right {
              text-align: right;
            }

            .total {
              font-size: 18px;
              font-weight: 700;
            }
          </style>
        </head>

        <body>
          <div class="header">
            <h1>Italir Pothe Invoice</h1>

            <p>
              Order:
              ${this.escapeHtml(order.orderNumber)}
            </p>

            <p>
              Status:
              ${this.escapeHtml(order.status)}
            </p>

            <p>
              Date:
              ${
                order.payment.paidAt
                  ? order.payment.paidAt.toISOString()
                  : order.createdAt.toISOString()
              }
            </p>
          </div>

          <table>
            <tr>
              <th>Package</th>
              <td class="right">${packageName}</td>
            </tr>

            <tr>
              <th>Package Price</th>
              <td class="right">
                €${order.pricing.basePriceEur}
              </td>
            </tr>

            ${couponRow}

            <tr>
              <th class="total">
                Total Amount Paid
              </th>

              <td class="right total">
                ${this.formatCurrencyAmount(
                  order.pricing.paymentAmount,
                  order.pricing.paymentCurrency,
                )}
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    return {
      fileName: `invoice-${order.orderNumber}.html`,

      html,
    };
  }

  // =========================================================
  // Small helpers
  // =========================================================

  private getPackageHistoryCategory(packageType: StorePackageType) {
    if (packageType === StorePackageType.AI_BUNDLE) {
      return PurchaseHistoryCategory.AI_REFILL;
    }

    if (packageType === StorePackageType.STREAK_FREEZE) {
      return PurchaseHistoryCategory.STREAK_FREEZE;
    }

    return PurchaseHistoryCategory.CV_CREDIT;
  }

  private mapExternalOrderStatus(status: string): StoreOrderStatus {
    const normalized = status.toLowerCase();

    if (normalized === 'paid' || normalized === 'completed') {
      return StoreOrderStatus.COMPLETED;
    }

    if (normalized === 'refunded') {
      return StoreOrderStatus.REFUNDED;
    }

    if (normalized === 'failed') {
      return StoreOrderStatus.FAILED;
    }

    return StoreOrderStatus.PENDING;
  }

  private generateOrderNumber() {
    const timePart = Date.now().toString(36).toUpperCase();

    const randomPart = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();

    return `IT-SHK-${timePart}-${randomPart}`;
  }

  private createDemoGoogleProductId(packageId: string) {
    const prefix =
      this.configService.get<string>('PACKAGE_GOOGLE_PLAY_PRODUCT_PREFIX') ??
      'demo_store';

    return `${prefix}_${packageId.replace(/-/g, '')}`;
  }

  private isDemoMode() {
    return (
      this.configService.get<string>('PAYMENTS_DEMO_MODE') === 'true'
    );
  }

  private assertDemoMode() {
    if (!this.isDemoMode()) {
      throw new ServiceUnavailableException(
        'Demo payment confirmation is disabled.',
      );
    }
  }

  private parseMoney(value: string, fieldName: string): number {
    const normalized = value.trim();

    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized)) {
      throw new BadRequestException(
        `${fieldName} must be a valid monetary amount.`,
      );
    }

    const [whole, fraction = ''] = normalized.split('.');

    const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

    if (!Number.isSafeInteger(minor) || minor < 0) {
      throw new BadRequestException(
        `${fieldName} is outside the supported range.`,
      );
    }

    return minor;
  }

  private formatMoney(minorUnits: number): string {
    return (minorUnits / 100).toFixed(2);
  }

  private percentageAmount(baseMinorUnits: number, percentage: number) {
    return Math.round((baseMinorUnits * percentage) / 100);
  }

  private formatCurrencyAmount(amount: string, currency: CommerceCurrency) {
    if (currency === CommerceCurrency.BDT) {
      return `৳${Number(amount).toFixed(0)}`;
    }

    return `€${Number(amount).toFixed(2)}`;
  }

  private formatMoneyFromNumber(amount: number) {
    return amount.toFixed(2);
  }

  private calculatePercentageChange(
    previousValue: number,
    currentValue: number,
  ) {
    if (previousValue === 0) {
      return currentValue === 0 ? 0 : 100;
    }

    return Number(
      (((currentValue - previousValue) / previousValue) * 100).toFixed(2),
    );
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
