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
  CreateStoreProviderProductDto,
  UpdateStoreProviderProductDto,
  VerifyStoreAppStorePurchaseDto,
  VerifyStoreGooglePlayPurchaseDto,
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
import { StoreOrderProviderSnapshot } from '../entities/store-order-provider-snapshot.entity';
import { StoreOrderProviderTransaction } from '../entities/store-order-provider-transaction.entity';
import { StoreOrderPricing } from '../entities/store-order-pricing.entity';
import { StoreOrderReversal } from '../entities/store-order-reversal.entity';
import { StoreOrderTimelineEvent } from '../entities/store-order-timeline-event.entity';
import { StorePackage } from '../entities/store-package.entity';
import { StorePackageCommerce } from '../entities/store-package-commerce.entity';
import { StorePackageEntitlement } from '../entities/store-package-entitlement.entity';
import { StorePackageProviderProduct } from '../entities/store-package-provider-product.entity';
import {
  PurchaseHistoryCategory,
  PurchaseHistorySortBy,
  StoreBillingModel,
  StoreMarketingBadge,
  StoreOrderStatus,
  StorePackageStatus,
  StorePackageType,
  StorePaymentProvider,
  StoreProviderEnvironment,
  StoreProviderProductType,
  StoreProviderVerificationStatus,
  StorePublicPackageSortBy,
  StoreSortOrder,
  StoreTimelineEventType,
  StreakProtectionMode,
  type StorePackageResponse,
  type StoreProviderProductResponse,
  type StoreQuote,
} from '../types/package-store.type';
import { StoreWalletService } from './store-wallet.service';
import { CourseProviderProduct } from 'src/module-2/course-commerce/entities/course-provider-product.entity';
import { CourseOrderProviderTransaction } from 'src/module-2/course-commerce/entities/course-order-provider-transaction.entity';

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

    @InjectRepository(StorePackageProviderProduct)
    private readonly providerProductRepository: Repository<StorePackageProviderProduct>,

    @InjectRepository(StoreOrder)
    private readonly orderRepository: Repository<StoreOrder>,

    @InjectRepository(StoreOrderPackageSnapshot)
    private readonly orderSnapshotRepository: Repository<StoreOrderPackageSnapshot>,

    @InjectRepository(StoreOrderPricing)
    private readonly orderPricingRepository: Repository<StoreOrderPricing>,

    @InjectRepository(StoreOrderPayment)
    private readonly orderPaymentRepository: Repository<StoreOrderPayment>,

    @InjectRepository(StoreOrderProviderSnapshot)
    private readonly orderProviderSnapshotRepository: Repository<StoreOrderProviderSnapshot>,

    @InjectRepository(StoreOrderProviderTransaction)
    private readonly orderProviderTransactionRepository: Repository<StoreOrderProviderTransaction>,

    @InjectRepository(StoreOrderReversal)
    private readonly orderReversalRepository: Repository<StoreOrderReversal>,

    @InjectRepository(StoreOrderTimelineEvent)
    private readonly timelineRepository: Repository<StoreOrderTimelineEvent>,

    @InjectRepository(CvEconomyConfig)
    private readonly configRepository: Repository<CvEconomyConfig>,

    @InjectRepository(CoursePurchaseOrder)
    private readonly courseOrderRepository: Repository<CoursePurchaseOrder>,

    @InjectRepository(CourseProviderProduct)
    private readonly courseProviderProductRepository: Repository<CourseProviderProduct>,

    @InjectRepository(CourseOrderProviderTransaction)
    private readonly courseProviderTransactionRepository: Repository<CourseOrderProviderTransaction>,

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
        relations: ['commerce', 'entitlement', 'providerProducts'],
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
      .leftJoinAndSelect('storePackage.providerProducts', 'providerProducts')
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

    if (query.provider) {
      queryBuilder.andWhere('providerProducts.provider = :provider', {
        provider: query.provider,
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

  async createProviderProduct(
    packageId: string,
    dto: CreateStoreProviderProductDto,
  ) {
    const storePackage = await this.getPackageById(packageId);

    const productId = dto.productId.trim();
    const basePlanId = dto.basePlanId?.trim() || null;
    const offerId = dto.offerId?.trim() || null;

    this.validateProviderProductConfiguration(storePackage, {
      provider: dto.provider,
      productType: dto.productType,
      basePlanId,
    });

    const providerProductId = await this.dataSource.transaction(
      async (manager) => {
        await this.lockProviderProductIdentity(
          manager,
          dto.provider,
          productId,
        );

        const repository = manager.getRepository(StorePackageProviderProduct);

        const duplicatePackageProduct = await repository.findOne({
          where: {
            provider: dto.provider,
            productId,
          },
        });

        if (duplicatePackageProduct) {
          throw new ConflictException(
            'This provider product ID is already mapped to another package version.',
          );
        }

        await this.assertProductNotMappedToCourse(
          dto.provider,
          productId,
          manager,
        );

        const isActive = dto.isActive ?? true;

        if (isActive) {
          await repository
            .createQueryBuilder()
            .update(StorePackageProviderProduct)
            .set({
              isActive: false,
            })
            .where('"packageId" = :packageId', {
              packageId,
            })
            .andWhere('provider = :provider', {
              provider: dto.provider,
            })
            .andWhere('"isActive" = true')
            .execute();
        }

        const saved = await repository.save(
          repository.create({
            packageId,
            provider: dto.provider,
            productId,
            productType: dto.productType,
            basePlanId,
            offerId,
            isActive,
          }),
        );

        return saved.id;
      },
    );

    return this.getProviderProductById(packageId, providerProductId);
  }

  async findProviderProducts(packageId: string) {
    await this.getPackageById(packageId);

    const items = await this.providerProductRepository.find({
      where: { packageId },
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
    packageId: string,
    providerProductId: string,
    dto: UpdateStoreProviderProductDto,
  ) {
    const storePackage = await this.getPackageById(packageId);
    const current = await this.getProviderProductEntity(
      packageId,
      providerProductId,
    );

    const identityIsChanging =
      (dto.productId !== undefined &&
        dto.productId.trim() !== current.productId) ||
      (dto.productType !== undefined &&
        dto.productType !== current.productType) ||
      (dto.basePlanId !== undefined &&
        (dto.basePlanId?.trim() || null) !== current.basePlanId) ||
      (dto.offerId !== undefined &&
        (dto.offerId?.trim() || null) !== current.offerId);

    if (identityIsChanging) {
      const referencedOrderCount =
        await this.orderProviderSnapshotRepository.count({
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

    const productId = dto.productId?.trim() ?? current.productId;
    const productType = dto.productType ?? current.productType;
    const basePlanId =
      dto.basePlanId !== undefined
        ? dto.basePlanId?.trim() || null
        : current.basePlanId;
    const offerId =
      dto.offerId !== undefined ? dto.offerId?.trim() || null : current.offerId;
    const isActive = dto.isActive ?? current.isActive;

    this.validateProviderProductConfiguration(storePackage, {
      provider: current.provider,
      productType,
      basePlanId,
    });

    const duplicate = await this.providerProductRepository
      .createQueryBuilder('providerProduct')
      .where('providerProduct.provider = :provider', {
        provider: current.provider,
      })
      .andWhere('providerProduct.productId = :productId', { productId })
      .andWhere('providerProduct.id != :providerProductId', {
        providerProductId,
      })
      .getOne();

    if (duplicate) {
      throw new ConflictException(
        'This provider product ID is already mapped to another package version.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await this.lockProviderProductIdentity(
        manager,
        current.provider,
        productId,
      );

      const repository = manager.getRepository(StorePackageProviderProduct);

      const duplicatePackageProduct = await repository
        .createQueryBuilder('providerProduct')
        .where('providerProduct.provider = :provider', {
          provider: current.provider,
        })
        .andWhere('providerProduct.productId = :productId', {
          productId,
        })
        .andWhere('providerProduct.id != :providerProductId', {
          providerProductId,
        })
        .getOne();

      if (duplicatePackageProduct) {
        throw new ConflictException(
          'This provider product ID is already mapped to another package version.',
        );
      }

      await this.assertProductNotMappedToCourse(
        current.provider,
        productId,
        manager,
      );

      if (isActive) {
        await repository
          .createQueryBuilder()
          .update(StorePackageProviderProduct)
          .set({
            isActive: false,
          })
          .where('"packageId" = :packageId', {
            packageId,
          })
          .andWhere('provider = :provider', {
            provider: current.provider,
          })
          .andWhere('id != :providerProductId', {
            providerProductId,
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

    return this.getProviderProductById(packageId, providerProductId);
  }

  async deactivateProviderProduct(
    packageId: string,
    providerProductId: string,
  ) {
    const providerProduct = await this.getProviderProductEntity(
      packageId,
      providerProductId,
    );

    providerProduct.isActive = false;
    await this.providerProductRepository.save(providerProduct);

    return {
      message: 'Provider product mapping deactivated successfully.',
      providerProduct: this.mapProviderProduct(providerProduct),
    };
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

  async getShop(userId: string, provider: StorePaymentProvider) {
    const [balances, packages, latestOrder] = await Promise.all([
      this.walletService.getBalances(userId),

      this.packageRepository
        .createQueryBuilder('storePackage')
        .leftJoinAndSelect('storePackage.commerce', 'commerce')
        .leftJoinAndSelect('storePackage.entitlement', 'entitlement')
        .innerJoinAndSelect(
          'storePackage.providerProducts',
          'providerProducts',
          'providerProducts.provider = :provider AND providerProducts.isActive = true',
          { provider },
        )
        .where('storePackage.status = :status', {
          status: StorePackageStatus.PUBLISHED,
        })
        .orderBy('storePackage.sortOrder', 'ASC')
        .addOrderBy('storePackage.createdAt', 'DESC')
        .getMany(),

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
      provider,
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

  async findPublicPackages(userId: string, query: PublicStorePackageQueryDto) {
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
      .innerJoinAndSelect(
        'storePackage.providerProducts',
        'providerProducts',
        'providerProducts.provider = :provider AND providerProducts.isActive = true',
        { provider: query.provider },
      )
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

    return {
      provider: query.provider,
      balances: await this.walletService.getBalances(userId),
      items: items.map((item) => this.mapPackage(item, false, query.provider)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPublicPackageById(
    packageId: string,
    provider: StorePaymentProvider,
  ) {
    const storePackage = await this.getPublishedPackage(packageId);
    const providerProduct = this.getActiveProviderProduct(
      storePackage,
      provider,
    );

    if (!providerProduct) {
      throw new NotFoundException(
        'This package is not available for the selected store provider.',
      );
    }

    return this.mapPackage(storePackage, false, provider);
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
    const providerProduct = this.requireActiveProviderProduct(
      storePackage,
      query.provider,
    );
    const currency = query.currency ?? CommerceCurrency.EUR;

    const quote = await this.calculateStoreQuote(
      storePackage,
      currency,
      query.couponCode,
    );

    return {
      package: this.mapPackage(storePackage, false, query.provider),
      storeProduct: this.mapProviderProduct(providerProduct),
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
      payment: {
        provider: query.provider,
        developmentVerification: this.isDevelopmentPaymentMode(),
      },
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
      relations: [
        'snapshot',
        'providerSnapshot',
        'providerTransaction',
        'pricing',
        'payment',
        'reversal',
        'timeline',
      ],
    });

    const selectedCurrency = dto.currency ?? CommerceCurrency.EUR;

    if (existingOrder) {
      if (
        existingOrder.packageId !== dto.packageId ||
        existingOrder.payment?.provider !== dto.paymentProvider ||
        existingOrder.providerSnapshot?.productId !== dto.productId ||
        existingOrder.pricing?.paymentCurrency !== selectedCurrency
      ) {
        throw new ConflictException(
          'The idempotency key is already assigned to another order request.',
        );
      }

      this.assertOrderRelations(existingOrder);
      return this.mapOrder(existingOrder);
    }

    const storePackage = await this.getPublishedPackage(dto.packageId);
    const providerProduct = this.requireActiveProviderProduct(
      storePackage,
      dto.paymentProvider,
      dto.productId,
    );

    await this.assertProductNotMappedToCourse(
      dto.paymentProvider,
      providerProduct.productId,
    );

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
      const providerSnapshotRepository = manager.getRepository(
        StoreOrderProviderSnapshot,
      );
      const providerTransactionRepository = manager.getRepository(
        StoreOrderProviderTransaction,
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
        }),
      );

      await providerSnapshotRepository.save(
        providerSnapshotRepository.create({
          orderId: order.id,
          providerProductId: providerProduct.id,
          provider: providerProduct.provider,
          productId: providerProduct.productId,
          productType: providerProduct.productType,
          basePlanId: providerProduct.basePlanId,
          offerId: providerProduct.offerId,
        }),
      );

      await providerTransactionRepository.save(
        providerTransactionRepository.create({
          orderId: order.id,
          provider: providerProduct.provider,
          productId: providerProduct.productId,
          tokenHash: null,
          providerTransactionId: null,
          environment: StoreProviderEnvironment.DEVELOPMENT,
          verificationStatus: StoreProviderVerificationStatus.PENDING,
          verifiedAt: null,
          verificationPayload: null,
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
          productId: providerProduct.productId,
          providerProductId: providerProduct.id,
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
      paymentMethod: {
        provider: order.providerSnapshot.provider,
        label:
          order.providerSnapshot.provider === StorePaymentProvider.GOOGLE_PLAY
            ? 'Google Play'
            : 'App Store',
        productId: order.providerSnapshot.productId,
        productType: order.providerSnapshot.productType,
        basePlanId: order.providerSnapshot.basePlanId,
        offerId: order.providerSnapshot.offerId,
        developmentVerification: this.isDevelopmentPaymentMode(),
      },
    };
  }

  async verifyGooglePlayPurchase(params: {
    userId: string;
    orderId: string;
    dto: VerifyStoreGooglePlayPurchaseDto;
  }) {
    this.assertDevelopmentPaymentMode();

    const order = await this.getOwnedOrderGraph(params.userId, params.orderId);

    if (order.providerSnapshot.provider !== StorePaymentProvider.GOOGLE_PLAY) {
      throw new BadRequestException(
        'This order was not created for Google Play.',
      );
    }

    if (params.dto.productId !== order.providerSnapshot.productId) {
      throw new BadRequestException(
        'Google Play product ID does not match the ordered package.',
      );
    }

    const tokenHash = createHash('sha256')
      .update(params.dto.purchaseToken)
      .digest('hex');
    const providerReference =
      params.dto.transactionId?.trim() || `google-play:${tokenHash}`;

    await this.markDevelopmentTransactionVerified({
      order,
      tokenHash,
      providerTransactionId: providerReference,
      payload: {
        source: 'development_google_play_verifier',
      },
    });

    return this.completeOrder({
      userId: params.userId,
      orderId: params.orderId,
      provider: StorePaymentProvider.GOOGLE_PLAY,
      providerReference,
    });
  }

  async verifyAppStorePurchase(params: {
    userId: string;
    orderId: string;
    dto: VerifyStoreAppStorePurchaseDto;
  }) {
    this.assertDevelopmentPaymentMode();

    const order = await this.getOwnedOrderGraph(params.userId, params.orderId);

    if (order.providerSnapshot.provider !== StorePaymentProvider.APP_STORE) {
      throw new BadRequestException(
        'This order was not created for the App Store.',
      );
    }

    if (params.dto.productId !== order.providerSnapshot.productId) {
      throw new BadRequestException(
        'App Store product ID does not match the ordered package.',
      );
    }

    const providerReference = params.dto.transactionId.trim();
    const tokenHash = params.dto.signedTransactionInfo
      ? createHash('sha256')
          .update(params.dto.signedTransactionInfo)
          .digest('hex')
      : null;

    await this.markDevelopmentTransactionVerified({
      order,
      tokenHash,
      providerTransactionId: providerReference,
      payload: {
        source: 'development_storekit_verifier',
        signedTransactionProvided: Boolean(params.dto.signedTransactionInfo),
      },
    });

    return this.completeOrder({
      userId: params.userId,
      orderId: params.orderId,
      provider: StorePaymentProvider.APP_STORE,
      providerReference,
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
      .leftJoinAndSelect('storeOrder.providerSnapshot', 'providerSnapshot')
      .leftJoinAndSelect(
        'storeOrder.providerTransaction',
        'providerTransaction',
      )
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

  private async markDevelopmentTransactionVerified(params: {
    order: StoreOrder;
    tokenHash: string | null;
    providerTransactionId: string;
    payload: Record<string, unknown>;
  }) {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(StoreOrderProviderTransaction);
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
          'The store order is missing its provider transaction record.',
        );
      }

      if (transaction.provider !== params.order.providerSnapshot.provider) {
        throw new ConflictException(
          'The provider transaction does not match the order provider.',
        );
      }

      await this.lockProviderTransactionIdentity(
        manager,
        transaction.provider,
        params.providerTransactionId,
        params.tokenHash,
      );

      await this.assertTransactionNotUsedByCourse(
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
      ${params.tokenHash ? 'OR providerTransaction.tokenHash = :tokenHash' : ''}
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
          'This store transaction has already been assigned to another order.',
        );
      }

      if (
        transaction.verificationStatus ===
          StoreProviderVerificationStatus.VERIFIED &&
        transaction.providerTransactionId === params.providerTransactionId &&
        transaction.tokenHash === params.tokenHash
      ) {
        return;
      }

      transaction.tokenHash = params.tokenHash;
      transaction.providerTransactionId = params.providerTransactionId;
      transaction.environment = StoreProviderEnvironment.DEVELOPMENT;
      transaction.verificationStatus = StoreProviderVerificationStatus.VERIFIED;
      transaction.verifiedAt = new Date();
      transaction.verificationPayload = params.payload;

      await repository.save(transaction);
    });
  }

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
        throw new ConflictException(
          'This package order has already been completed.',
        );
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

      if (order.providerSnapshot.provider !== params.provider) {
        throw new BadRequestException(
          'The provider product snapshot does not match the order.',
        );
      }

      if (
        order.providerTransaction.verificationStatus !==
        StoreProviderVerificationStatus.VERIFIED
      ) {
        throw new BadRequestException(
          'The store transaction has not been verified.',
        );
      }

      if (
        order.providerTransaction.providerTransactionId !==
        params.providerReference
      ) {
        throw new BadRequestException(
          'The verified transaction reference does not match the payment.',
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

          productId: order.providerSnapshot.productId,

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
  // Provider product mapping
  // =========================================================

  private validateProviderProductConfiguration(
    storePackage: StorePackage,
    input: {
      provider: StorePaymentProvider;
      productType: StoreProviderProductType;
      basePlanId: string | null;
    },
  ) {
    if (storePackage.commerce.billingModel === StoreBillingModel.MONTHLY) {
      if (input.productType !== StoreProviderProductType.SUBSCRIPTION) {
        throw new BadRequestException(
          'Monthly packages must map to a subscription product.',
        );
      }

      if (
        input.provider === StorePaymentProvider.GOOGLE_PLAY &&
        !input.basePlanId
      ) {
        throw new BadRequestException(
          'Google Play subscriptions require a basePlanId.',
        );
      }

      return;
    }

    if (input.productType !== StoreProviderProductType.CONSUMABLE) {
      throw new BadRequestException(
        'One-time AI, CV-credit and finite streak-freeze packages must use consumable store products.',
      );
    }

    if (input.basePlanId) {
      throw new BadRequestException(
        'A one-time consumable product cannot have a basePlanId.',
      );
    }
  }

  private getActiveProviderProduct(
    storePackage: StorePackage,
    provider: StorePaymentProvider,
  ) {
    return (storePackage.providerProducts ?? []).find(
      (item) => item.provider === provider && item.isActive,
    );
  }

  private requireActiveProviderProduct(
    storePackage: StorePackage,
    provider: StorePaymentProvider,
    productId?: string,
  ) {
    const providerProduct = this.getActiveProviderProduct(
      storePackage,
      provider,
    );

    if (!providerProduct) {
      throw new BadRequestException(
        'This package has no active product mapping for the selected provider.',
      );
    }

    if (productId && providerProduct.productId !== productId.trim()) {
      throw new BadRequestException(
        'The supplied store product ID does not match the active package mapping.',
      );
    }

    this.validateProviderProductConfiguration(storePackage, {
      provider: providerProduct.provider,
      productType: providerProduct.productType,
      basePlanId: providerProduct.basePlanId,
    });

    return providerProduct;
  }

  private async getProviderProductEntity(
    packageId: string,
    providerProductId: string,
  ) {
    const providerProduct = await this.providerProductRepository.findOne({
      where: {
        id: providerProductId,
        packageId,
      },
    });

    if (!providerProduct) {
      throw new NotFoundException('Provider product mapping not found.');
    }

    return providerProduct;
  }

  private async getProviderProductById(
    packageId: string,
    providerProductId: string,
  ) {
    const providerProduct = await this.getProviderProductEntity(
      packageId,
      providerProductId,
    );

    return this.mapProviderProduct(providerProduct);
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
    selectedProvider?: StorePaymentProvider,
  ): StorePackageResponse & {
    status?: StorePackageStatus;
    publishedAt?: Date | null;
    archivedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  } {
    const selectedProduct = selectedProvider
      ? this.getActiveProviderProduct(storePackage, selectedProvider)
      : null;

    const result: StorePackageResponse = {
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
      storeProduct: selectedProduct
        ? this.mapProviderProduct(selectedProduct)
        : null,
    };

    if (!includePrivateFields) {
      return result;
    }

    return {
      ...result,
      providerProducts: [...(storePackage.providerProducts ?? [])]
        .sort((left, right) => {
          if (left.provider !== right.provider) {
            return left.provider.localeCompare(right.provider);
          }

          if (left.isActive !== right.isActive) {
            return left.isActive ? -1 : 1;
          }

          return right.createdAt.getTime() - left.createdAt.getTime();
        })
        .map((item) => this.mapProviderProduct(item)),
      status: storePackage.status,
      publishedAt: storePackage.publishedAt,
      archivedAt: storePackage.archivedAt,
      createdAt: storePackage.createdAt,
      updatedAt: storePackage.updatedAt,
    };
  }

  private mapProviderProduct(
    providerProduct: StorePackageProviderProduct,
  ): StoreProviderProductResponse {
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

      storeProduct: {
        providerProductId: order.providerSnapshot.providerProductId,
        provider: order.providerSnapshot.provider,
        productId: order.providerSnapshot.productId,
        productType: order.providerSnapshot.productType,
        basePlanId: order.providerSnapshot.basePlanId,
        offerId: order.providerSnapshot.offerId,
      },

      verification: {
        environment: order.providerTransaction.environment,
        status: order.providerTransaction.verificationStatus,
        providerTransactionId: order.providerTransaction.providerTransactionId,
        verifiedAt: order.providerTransaction.verifiedAt,
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

        storeProduct: {
          provider: order.providerSnapshot.provider,
          productId: order.providerSnapshot.productId,
          productType: order.providerSnapshot.productType,
          basePlanId: order.providerSnapshot.basePlanId,
          offerId: order.providerSnapshot.offerId,
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
      relations: ['commerce', 'entitlement', 'providerProducts'],
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
      relations: ['commerce', 'entitlement', 'providerProducts'],
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
        'providerSnapshot',
        'providerTransaction',
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
        'providerSnapshot',
        'providerTransaction',
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
    const order = await manager.getRepository(StoreOrder).findOne({
      where: userId
        ? {
            id: orderId,
            userId,
          }
        : {
            id: orderId,
          },

      relations: [
        'snapshot',
        'providerSnapshot',
        'providerTransaction',
        'pricing',
        'payment',
        'reversal',
        'timeline',
        'package',
        'user',
      ],

      lock: {
        mode: 'pessimistic_write',
      },
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
      !order.providerSnapshot ||
      !order.providerTransaction ||
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

  private isDevelopmentPaymentMode() {
    return this.configService.get<string>('PAYMENTS_DEMO_MODE') === 'true';
  }

  private assertDevelopmentPaymentMode() {
    if (
      !this.isDevelopmentPaymentMode() ||
      this.configService.get<string>('NODE_ENV') === 'production'
    ) {
      throw new ServiceUnavailableException(
        'Development store verification is disabled.',
      );
    }
  }

  // Kept only for the existing admin demo-refund endpoint.
  private assertDemoMode() {
    this.assertDevelopmentPaymentMode();
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

  private async lockProviderProductIdentity(
    manager: EntityManager,
    provider: StorePaymentProvider,
    productId: string,
  ): Promise<void> {
    const lockKey = `billing-product:${provider}:${productId}`;

    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
      lockKey,
    ]);
  }

  private async lockProviderTransactionIdentity(
    manager: EntityManager,
    provider: StorePaymentProvider,
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

  private async assertProductNotMappedToCourse(
    provider: StorePaymentProvider,
    productId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager
      ? manager.getRepository(CourseProviderProduct)
      : this.courseProviderProductRepository;

    const conflictingCourseProduct = await repository
      .createQueryBuilder('courseProviderProduct')
      .where('courseProviderProduct.provider = :provider', {
        provider,
      })
      .andWhere('courseProviderProduct.productId = :productId', {
        productId,
      })
      .getOne();

    if (conflictingCourseProduct) {
      throw new ConflictException(
        'This store product ID is already mapped to a course and cannot be used for an AI, CV, or streak package.',
      );
    }
  }

  private async assertTransactionNotUsedByCourse(
    provider: StorePaymentProvider,
    providerTransactionId: string,
    tokenHash: string | null,
    manager: EntityManager,
  ): Promise<void> {
    const repository = manager.getRepository(CourseOrderProviderTransaction);

    const queryBuilder = repository
      .createQueryBuilder('courseTransaction')
      .where('courseTransaction.provider = :provider', {
        provider,
      })
      .andWhere(
        `(
        courseTransaction.providerTransactionId = :providerTransactionId
        ${tokenHash ? 'OR courseTransaction.tokenHash = :tokenHash' : ''}
      )`,
        {
          providerTransactionId,
          ...(tokenHash ? { tokenHash } : {}),
        },
      );

    const duplicate = await queryBuilder.getOne();

    if (duplicate) {
      throw new ConflictException(
        'This store purchase token or transaction ID has already been used for a course purchase.',
      );
    }
  }
}
