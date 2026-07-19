import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Course } from 'src/module-2/courses/entities/course.entity';
import { StorePackage } from 'src/package-store/entities/store-package.entity';
import { EntityManager, Repository } from 'typeorm';

import {
  AddManualLedgerEntryDto,
  CreateInfluencerPartnerDto,
  InfluencerDealDto,
  InfluencerPartnerQueryDto,
  InfluencerProviderMappingDto,
  InfluencerReportQueryDto,
  UpdateInfluencerPartnerDto,
  ValidateInfluencerCouponDto,
} from '../dto/influencer-hub.dto';
import { InfluencerCouponProviderMapping } from '../entities/influencer-coupon-provider-mapping.entity';
import { InfluencerCoupon } from '../entities/influencer-coupon.entity';
import { InfluencerLedgerEntry } from '../entities/influencer-ledger-entry.entity';
import { InfluencerOrderAttribution } from '../entities/influencer-order-attribution.entity';
import { InfluencerPartner } from '../entities/influencer-partner.entity';
import { InfluencerSocialHandle } from '../entities/influencer-social-handle.entity';
import {
  InfluencerAttributionStatus,
  InfluencerBillingProvider,
  InfluencerCheckoutCouponResolution,
  InfluencerCouponOwnerType,
  InfluencerCouponProductDomain,
  InfluencerCouponStatus,
  InfluencerLedgerStatus,
  InfluencerLedgerTransactionType,
  InfluencerOrderDomain,
  InfluencerPartnerSortBy,
  InfluencerPartnerStatus,
  InfluencerSortOrder,
} from '../types/influencer-hub.type';

interface PendingAttributionInput {
  userId: string;
  orderDomain: InfluencerOrderDomain;
  orderId: string;
  productId: string;
  resolution: InfluencerCheckoutCouponResolution;
}

@Injectable()
export class InfluencerHubService {
  private readonly taxWarning =
    'Google Play or App Store controls the final localized charge. Local VAT, tax, and currency conversion may be added by the store checkout.';

  constructor(
    @InjectRepository(InfluencerPartner)
    private readonly partnerRepository: Repository<InfluencerPartner>,

    @InjectRepository(InfluencerSocialHandle)
    private readonly handleRepository: Repository<InfluencerSocialHandle>,

    @InjectRepository(InfluencerCoupon)
    private readonly couponRepository: Repository<InfluencerCoupon>,

    @InjectRepository(InfluencerCouponProviderMapping)
    private readonly mappingRepository: Repository<InfluencerCouponProviderMapping>,

    @InjectRepository(InfluencerOrderAttribution)
    private readonly attributionRepository: Repository<InfluencerOrderAttribution>,

    @InjectRepository(InfluencerLedgerEntry)
    private readonly ledgerRepository: Repository<InfluencerLedgerEntry>,

    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,

    @InjectRepository(StorePackage)
    private readonly storePackageRepository: Repository<StorePackage>,
  ) {}

  async getDashboard() {
    const [partners, attributions, ledgerEntries] = await Promise.all([
      this.partnerRepository.find(),
      this.attributionRepository.find(),
      this.ledgerRepository.find(),
    ]);

    const converted = attributions.filter(
      (item) => item.status === InfluencerAttributionStatus.CONVERTED,
    );

    const totalSales = this.sumMoney(
      converted.map((item) => item.payableAmountEur),
    );
    const lifetimeCommissionEarned = this.sumMoney(
      converted.map((item) => item.commissionAmountEur),
    );
    const totalCommissionOwed = this.sumMoney(
      ledgerEntries
        .filter((item) => item.status === InfluencerLedgerStatus.PENDING)
        .map((item) => item.amountEur),
    );
    const paidPayoutAmount = this.sumMoney(
      ledgerEntries
        .filter(
          (item) =>
            item.transactionType === InfluencerLedgerTransactionType.PAYOUT &&
            item.status === InfluencerLedgerStatus.PAID,
        )
        .map((item) => item.amountEur),
    );

    return {
      success: true,
      message: 'Influencer dashboard retrieved successfully.',
      data: {
        totalPartners: partners.length,
        activePartners: partners.filter(
          (item) => item.status === InfluencerPartnerStatus.ACTIVE,
        ).length,
        totalLinkedUsers: new Set(converted.map((item) => item.userId)).size,
        activeReferrals: converted.length,
        totalSales,
        lifetimeCommissionEarned,
        totalCommissionOwed,
        pendingPayoutAmount: totalCommissionOwed,
        paidPayoutAmount,
        currency: 'EUR',
      },
    };
  }

  async listPartners(query: InfluencerPartnerQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.partnerRepository
      .createQueryBuilder('partner')
      .leftJoinAndSelect('partner.coupons', 'coupon')
      .leftJoinAndSelect('coupon.providerMappings', 'mapping');

    if (query.status) {
      qb.andWhere('partner.status = :status', { status: query.status });
    }

    if (query.couponCode?.trim()) {
      qb.andWhere('coupon.couponCode = :couponCode', {
        couponCode: query.couponCode.trim().toUpperCase(),
      });
    }

    if (query.productDomain) {
      qb.andWhere('mapping.productDomain = :productDomain', {
        productDomain: query.productDomain,
      });
    }

    if (query.search?.trim()) {
      qb.andWhere(
        `(
          partner.fullName ILIKE :search
          OR partner.email ILIKE :search
          OR coupon.couponCode ILIKE :search
        )`,
        { search: `%${query.search.trim()}%` },
      );
    }

    const sortOrder = query.sortOrder ?? InfluencerSortOrder.DESC;
    const sortBy = query.sortBy ?? InfluencerPartnerSortBy.CREATED_AT;

    if (
      sortBy === InfluencerPartnerSortBy.CREATED_AT ||
      sortBy === InfluencerPartnerSortBy.FULL_NAME
    ) {
      qb.orderBy(`partner.${sortBy}`, sortOrder);
    } else {
      qb.orderBy('partner.createdAt', InfluencerSortOrder.DESC);
    }

    qb.skip((page - 1) * limit).take(limit);

    const [partners, total] = await qb.getManyAndCount();
    const partnerIds = partners.map((item) => item.id);
    const stats = await this.getPartnerStatsMap(partnerIds);

    const items = partners.map((partner) => ({
      ...this.mapPartnerListItem(partner),
      ...(stats.get(partner.id) ?? this.emptyPartnerStats()),
    }));

    if (
      sortBy === InfluencerPartnerSortBy.USERS_LINKED ||
      sortBy === InfluencerPartnerSortBy.TOTAL_SALES ||
      sortBy === InfluencerPartnerSortBy.COMMISSION
    ) {
      const direction = sortOrder === InfluencerSortOrder.ASC ? 1 : -1;
      items.sort((left, right) => {
        const leftValue = Number(
          sortBy === InfluencerPartnerSortBy.USERS_LINKED
            ? left.usersLinked
            : sortBy === InfluencerPartnerSortBy.TOTAL_SALES
              ? left.totalSalesEur
              : left.commissionEarnedEur,
        );
        const rightValue = Number(
          sortBy === InfluencerPartnerSortBy.USERS_LINKED
            ? right.usersLinked
            : sortBy === InfluencerPartnerSortBy.TOTAL_SALES
              ? right.totalSalesEur
              : right.commissionEarnedEur,
        );

        return (leftValue - rightValue) * direction;
      });
    }

    return {
      success: true,
      message: 'Influencer partners retrieved successfully.',
      data: {
        items,
        meta: {
          page,
          limit,
          totalItems: total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page * limit < total,
          hasPreviousPage: page > 1,
        },
      },
    };
  }

  async createPartner(dto: CreateInfluencerPartnerDto) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.partnerRepository.findOne({
      where: { email },
    });

    if (existing) {
      throw new ConflictException(
        'An influencer partner already uses this email.',
      );
    }

    const partnerId = await this.partnerRepository.manager.transaction(
      async (manager) => {
        const partnerRepository = manager.getRepository(InfluencerPartner);
        const handleRepository = manager.getRepository(InfluencerSocialHandle);

        const partner = await partnerRepository.save(
          partnerRepository.create({
            fullName: dto.fullName.trim(),
            email,
            title: dto.title ?? null,
            avatarUrl: dto.avatarUrl ?? null,
            status: dto.status ?? InfluencerPartnerStatus.ACTIVE,
            paymentMethod: dto.paymentMethod ?? undefined,
            paymentDetails: dto.paymentDetails ?? null,
            paymentDisplayLabel: dto.paymentDisplayLabel ?? null,
            currency: dto.currency?.toUpperCase() ?? 'EUR',
            administrativeNotes: dto.administrativeNotes ?? null,
            lastActivityAt: null,
          }),
        );

        if (dto.socialHandles?.length) {
          await handleRepository.save(
            dto.socialHandles.map((item, index) =>
              handleRepository.create({
                partnerId: partner.id,
                platform: item.platform,
                handle: item.handle.trim(),
                url: item.url ?? null,
                sortOrder: item.sortOrder ?? index,
              }),
            ),
          );
        }

        if (dto.deal) {
          await this.upsertDealWithManager(manager, partner.id, dto.deal);
        }

        return partner.id;
      },
    );

    return {
      success: true,
      message: 'Influencer partner created successfully.',
      data: await this.getPartnerData(partnerId),
    };
  }

  async getPartner(partnerId: string) {
    return {
      success: true,
      message: 'Influencer partner retrieved.',
      data: await this.getPartnerData(partnerId),
    };
  }

  async updatePartner(partnerId: string, dto: UpdateInfluencerPartnerDto) {
    await this.partnerRepository.manager.transaction(async (manager) => {
      const partnerRepository = manager.getRepository(InfluencerPartner);
      const handleRepository = manager.getRepository(InfluencerSocialHandle);

      const partner = await partnerRepository.findOne({
        where: { id: partnerId },
      });

      if (!partner) {
        throw new NotFoundException('Influencer partner not found.');
      }

      if (dto.email !== undefined) {
        const email = dto.email.trim().toLowerCase();
        const existing = await partnerRepository.findOne({ where: { email } });

        if (existing && existing.id !== partner.id) {
          throw new ConflictException(
            'Another influencer partner already uses this email.',
          );
        }

        partner.email = email;
      }

      if (dto.fullName !== undefined) partner.fullName = dto.fullName.trim();
      if (dto.title !== undefined) partner.title = dto.title ?? null;
      if (dto.avatarUrl !== undefined)
        partner.avatarUrl = dto.avatarUrl ?? null;
      if (dto.status !== undefined) partner.status = dto.status;
      if (dto.paymentMethod !== undefined)
        partner.paymentMethod = dto.paymentMethod;
      if (dto.paymentDetails !== undefined)
        partner.paymentDetails = dto.paymentDetails ?? null;
      if (dto.paymentDisplayLabel !== undefined) {
        partner.paymentDisplayLabel = dto.paymentDisplayLabel ?? null;
      }
      if (dto.currency !== undefined)
        partner.currency = dto.currency.toUpperCase();
      if (dto.administrativeNotes !== undefined) {
        partner.administrativeNotes = dto.administrativeNotes ?? null;
      }

      await partnerRepository.save(partner);

      if (dto.socialHandles !== undefined) {
        await handleRepository.delete({ partnerId: partner.id });

        if (dto.socialHandles.length) {
          await handleRepository.save(
            dto.socialHandles.map((item, index) =>
              handleRepository.create({
                partnerId: partner.id,
                platform: item.platform,
                handle: item.handle.trim(),
                url: item.url ?? null,
                sortOrder: item.sortOrder ?? index,
              }),
            ),
          );
        }
      }

      if (dto.deal !== undefined) {
        await this.upsertDealWithManager(manager, partner.id, dto.deal);
      }
    });

    return {
      success: true,
      message: 'Influencer partner updated successfully.',
      data: await this.getPartnerData(partnerId),
    };
  }

  async archivePartner(partnerId: string) {
    const partner = await this.partnerRepository.findOne({
      where: { id: partnerId },
    });

    if (!partner) {
      throw new NotFoundException('Influencer partner not found.');
    }

    partner.status = InfluencerPartnerStatus.INACTIVE;
    await this.partnerRepository.save(partner);

    await this.couponRepository.update(
      { partnerId: partner.id },
      { status: InfluencerCouponStatus.PAUSED },
    );

    return {
      success: true,
      message: 'Influencer partner deactivated successfully.',
      data: { id: partner.id, status: partner.status },
    };
  }

  async createLedgerEntry(partnerId: string, dto: AddManualLedgerEntryDto) {
    const partner = await this.partnerRepository.findOne({
      where: { id: partnerId },
    });

    if (!partner) {
      throw new NotFoundException('Influencer partner not found.');
    }

    const amountEur = this.formatMoney(
      this.parseMoney(dto.amountEur, 'Amount'),
    );
    const transactionType =
      dto.transactionType ?? InfluencerLedgerTransactionType.MANUAL_ADJUSTMENT;

    const entry = await this.ledgerRepository.save(
      this.ledgerRepository.create({
        partnerId,
        couponId: null,
        attributionId: null,
        orderDomain: null,
        orderId: null,
        transactionType,
        referenceId: dto.referenceId?.trim() || this.generateReference('TR'),
        amountEur,
        status: dto.status ?? InfluencerLedgerStatus.PENDING,
        notes: dto.notes ?? null,
        transactionDate: dto.transactionDate
          ? new Date(dto.transactionDate)
          : new Date(),
      }),
    );

    return {
      success: true,
      message:
        transactionType === InfluencerLedgerTransactionType.PAYOUT
          ? 'Payout created.'
          : 'Ledger adjustment created.',
      data: this.mapLedgerEntry(entry),
    };
  }

  async getReport(partnerId: string, query: InfluencerReportQueryDto = {}) {
    const partner = await this.partnerRepository.findOne({
      where: { id: partnerId },
      relations: ['socialHandles', 'coupons', 'coupons.providerMappings'],
    });

    if (!partner) {
      throw new NotFoundException('Influencer partner not found.');
    }

    const from = query.dateFrom ? new Date(query.dateFrom) : null;
    const to = query.dateTo ? new Date(query.dateTo) : null;

    const attributionQb = this.attributionRepository
      .createQueryBuilder('item')
      .where('item.partnerId = :partnerId', { partnerId });

    if (from) attributionQb.andWhere('item.createdAt >= :from', { from });
    if (to) attributionQb.andWhere('item.createdAt <= :to', { to });

    const attributions = await attributionQb.getMany();
    const ledgerEntries = await this.ledgerRepository.find({
      where: { partnerId },
      order: { transactionDate: 'DESC' },
    });

    const converted = attributions.filter(
      (item) => item.status === InfluencerAttributionStatus.CONVERTED,
    );

    return {
      success: true,
      message: 'Influencer report retrieved successfully.',
      data: {
        partner: this.mapPartnerDetail(partner),
        summary: {
          totalUsers: new Set(converted.map((item) => item.userId)).size,
          totalConversions: converted.length,
          totalSalesEur: this.sumMoney(
            converted.map((item) => item.payableAmountEur),
          ),
          lifetimeEarningsEur: this.sumMoney(
            converted.map((item) => item.commissionAmountEur),
          ),
          commissionOwedEur: this.sumMoney(
            ledgerEntries
              .filter((item) => item.status === InfluencerLedgerStatus.PENDING)
              .map((item) => item.amountEur),
          ),
        },
        earningsGrowthTrend: this.buildMonthlyTrend(converted),
        payoutHistory: ledgerEntries.map((entry) => this.mapLedgerEntry(entry)),
      },
    };
  }

  async exportCsv(query: InfluencerPartnerQueryDto) {
    const response = await this.listPartners({ ...query, page: 1, limit: 100 });
    const rows = response.data.items;
    const header = [
      'id',
      'fullName',
      'email',
      'couponCode',
      'status',
      'usersLinked',
      'totalSalesEur',
      'commissionEarnedEur',
    ];

    return [
      header.join(','),
      ...rows.map((row) =>
        [
          row.id,
          this.csv(row.fullName),
          this.csv(row.email),
          this.csv(row.primaryCouponCode ?? ''),
          row.status,
          row.usersLinked,
          row.totalSalesEur,
          row.commissionEarnedEur,
        ].join(','),
      ),
    ].join('\n');
  }

  async validateCoupon(dto: ValidateInfluencerCouponDto) {
    const basePriceEur = await this.resolveBasePrice(dto);
    const resolution = await this.resolveCouponForCheckout({
      couponCode: dto.couponCode,
      productDomain: dto.productDomain,
      productId: dto.productId,
      provider: dto.provider,
      regularProviderProductId: dto.regularProviderProductId,
      basePriceEur,
    });

    return {
      success: true,
      message: 'Coupon validation result.',
      data: this.mapCouponResolution(resolution),
    };
  }

  async resolveCouponForCheckout(params: {
    couponCode: string;
    productDomain: InfluencerCouponProductDomain;
    productId: string;
    provider: InfluencerBillingProvider;
    regularProviderProductId?: string | null;
    basePriceEur: string;
  }): Promise<InfluencerCheckoutCouponResolution> {
    const couponCode = params.couponCode.trim().toUpperCase();
    const basePriceEur = this.formatMoney(
      this.parseMoney(params.basePriceEur, 'Base price'),
    );

    const coupon = await this.couponRepository.findOne({
      where: { couponCode },
      relations: ['partner', 'providerMappings'],
    });

    if (coupon) {
      if (coupon.ownerType === InfluencerCouponOwnerType.PRODUCT) {
        return this.resolveProductOwnCoupon({
          couponCode,
          productDomain: params.productDomain,
          productId: params.productId,
          provider: params.provider,
          regularProviderProductId: params.regularProviderProductId,
          basePriceEur,
        });
      }

      return this.resolveStoredCoupon({
        coupon,
        productDomain: params.productDomain,
        productId: params.productId,
        provider: params.provider,
        regularProviderProductId: params.regularProviderProductId,
        basePriceEur,
      });
    }

    return this.resolveProductOwnCoupon({
      couponCode,
      productDomain: params.productDomain,
      productId: params.productId,
      provider: params.provider,
      regularProviderProductId: params.regularProviderProductId,
      basePriceEur,
    });
  }

  async recordPendingOrderAttribution(
    manager: EntityManager,
    input: PendingAttributionInput,
  ) {
    const repository = manager.getRepository(InfluencerOrderAttribution);

    const existing = await repository.findOne({
      where: {
        orderDomain: input.orderDomain,
        orderId: input.orderId,
      },
    });

    if (existing) {
      return existing;
    }

    const commissionMinor = this.percentageAmount(
      this.parseMoney(input.resolution.payableAmountEur, 'Payable amount'),
      input.resolution.influencerSharePercentage,
    );

    return repository.save(
      repository.create({
        partnerId: input.resolution.partnerId,
        couponId: input.resolution.couponId,
        userId: input.userId,
        orderDomain: input.orderDomain,
        orderId: input.orderId,
        productId: input.productId,
        couponCode: input.resolution.couponCode,
        ownerType: input.resolution.ownerType,
        provider: input.resolution.provider,
        regularProviderProductId: input.resolution.regularProviderProductId,
        chargedProviderProductId: input.resolution.discountedProviderProductId,
        baseAmountEur: input.resolution.basePriceEur,
        discountPercentage: input.resolution.discountPercentage,
        discountAmountEur: input.resolution.discountAmountEur,
        payableAmountEur: input.resolution.payableAmountEur,
        influencerSharePercentage: input.resolution.influencerSharePercentage,
        commissionAmountEur: this.formatMoney(commissionMinor),
        status: InfluencerAttributionStatus.PENDING,
        convertedAt: null,
        reversedAt: null,
      }),
    );
  }

  async convertOrderAttribution(
    manager: EntityManager,
    params: {
      orderDomain: InfluencerOrderDomain;
      orderId: string;
      paidAt?: Date;
    },
  ) {
    const attributionRepository = manager.getRepository(
      InfluencerOrderAttribution,
    );
    const ledgerRepository = manager.getRepository(InfluencerLedgerEntry);

    const attribution = await attributionRepository.findOne({
      where: {
        orderDomain: params.orderDomain,
        orderId: params.orderId,
      },
    });

    if (!attribution || !attribution.partnerId) {
      return null;
    }

    if (attribution.status === InfluencerAttributionStatus.CONVERTED) {
      return attribution;
    }

    attribution.status = InfluencerAttributionStatus.CONVERTED;
    attribution.convertedAt = params.paidAt ?? new Date();

    await attributionRepository.save(attribution);

    const existingLedger = await ledgerRepository.findOne({
      where: {
        orderDomain: params.orderDomain,
        orderId: params.orderId,
        transactionType: InfluencerLedgerTransactionType.COMMISSION,
      },
    });

    if (!existingLedger) {
      await ledgerRepository.save(
        ledgerRepository.create({
          partnerId: attribution.partnerId,
          couponId: attribution.couponId,
          attributionId: attribution.id,
          orderDomain: params.orderDomain,
          orderId: params.orderId,
          transactionType: InfluencerLedgerTransactionType.COMMISSION,
          referenceId: this.generateReference('COM'),
          amountEur: attribution.commissionAmountEur,
          status: InfluencerLedgerStatus.PENDING,
          notes:
            'Commission generated after successful store purchase verification.',
          transactionDate: attribution.convertedAt,
        }),
      );
    }

    await manager
      .getRepository(InfluencerPartner)
      .update(
        { id: attribution.partnerId },
        { lastActivityAt: attribution.convertedAt },
      );

    return attribution;
  }

  async reverseOrderAttribution(
    manager: EntityManager,
    params: {
      orderDomain: InfluencerOrderDomain;
      orderId: string;
      reversedAt?: Date;
      notes?: string;
    },
  ) {
    const attributionRepository = manager.getRepository(
      InfluencerOrderAttribution,
    );
    const ledgerRepository = manager.getRepository(InfluencerLedgerEntry);

    const attribution = await attributionRepository.findOne({
      where: {
        orderDomain: params.orderDomain,
        orderId: params.orderId,
      },
    });

    if (!attribution || !attribution.partnerId) {
      return null;
    }

    attribution.status = InfluencerAttributionStatus.REVERSED;
    attribution.reversedAt = params.reversedAt ?? new Date();

    await attributionRepository.save(attribution);

    await ledgerRepository.save(
      ledgerRepository.create({
        partnerId: attribution.partnerId,
        couponId: attribution.couponId,
        attributionId: attribution.id,
        orderDomain: params.orderDomain,
        orderId: params.orderId,
        transactionType: InfluencerLedgerTransactionType.REVERSAL,
        referenceId: this.generateReference('REV'),
        amountEur: this.formatMoney(
          -this.parseMoney(attribution.commissionAmountEur, 'Commission'),
        ),
        status: InfluencerLedgerStatus.PENDING,
        notes:
          params.notes ?? 'Commission reversed after refunded store purchase.',
        transactionDate: attribution.reversedAt,
      }),
    );

    return attribution;
  }

  async handlePaidOrder(dto: {
    orderDomain: InfluencerOrderDomain;
    orderId: string;
    paidAt?: string;
  }) {
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    await this.partnerRepository.manager.transaction((manager) =>
      this.convertOrderAttribution(manager, {
        orderDomain: dto.orderDomain,
        orderId: dto.orderId,
        paidAt,
      }),
    );

    return {
      success: true,
      message: 'Order processed for influencer attribution.',
    };
  }

  private async resolveStoredCoupon(params: {
    coupon: InfluencerCoupon;
    productDomain: InfluencerCouponProductDomain;
    productId: string;
    provider: InfluencerBillingProvider;
    regularProviderProductId?: string | null;
    basePriceEur: string;
  }): Promise<InfluencerCheckoutCouponResolution> {
    const coupon = params.coupon;

    this.assertCouponActive(coupon);

    const mapping = (coupon.providerMappings ?? []).find((item) => {
      const productMatches =
        params.productDomain === InfluencerCouponProductDomain.COURSE
          ? item.courseId === params.productId
          : item.storePackageId === params.productId;

      return (
        item.isActive &&
        item.productDomain === params.productDomain &&
        productMatches &&
        item.provider === params.provider
      );
    });

    if (!mapping) {
      throw new BadRequestException(
        'Coupon is valid, but no matching discounted store product is configured for this product and provider.',
      );
    }

    if (
      params.regularProviderProductId &&
      mapping.regularProviderProductId !== params.regularProviderProductId
    ) {
      throw new BadRequestException(
        'Coupon mapping does not match the regular store product configured for this item.',
      );
    }

    this.assertCouponProviderProductPrefix({
      regularProviderProductId: mapping.regularProviderProductId,
      discountedProviderProductId: mapping.discountedProviderProductId,
    });

    return this.buildResolution({
      coupon,
      mapping,
      partnerDisplayName: coupon.partner?.fullName ?? null,
      basePriceEur: params.basePriceEur,
    });
  }

  private async resolveProductOwnCoupon(params: {
    couponCode: string;
    productDomain: InfluencerCouponProductDomain;
    productId: string;
    provider: InfluencerBillingProvider;
    regularProviderProductId?: string | null;
    basePriceEur: string;
  }): Promise<InfluencerCheckoutCouponResolution> {
    const productCouponCode = await this.getProductOwnCouponCode(
      params.productDomain,
      params.productId,
    );

    if (!productCouponCode || productCouponCode !== params.couponCode) {
      throw new BadRequestException('Coupon code is invalid for this product.');
    }

    const coupon = await this.couponRepository.findOne({
      where: {
        couponCode: params.couponCode,
        ownerType: InfluencerCouponOwnerType.PRODUCT,
      },
      relations: ['partner', 'providerMappings'],
    });

    if (!coupon) {
      const regularProviderProductId = params.regularProviderProductId?.trim();

      if (!regularProviderProductId) {
        throw new BadRequestException(
          'regularProviderProductId is required to resolve a product-owned coupon.',
        );
      }

      const discountPercentage = this.parseCouponPercentage(params.couponCode);

      const createdCoupon = await this.couponRepository.manager.transaction(
        async (manager) => {
          const couponRepository = manager.getRepository(InfluencerCoupon);
          const mappingRepository = manager.getRepository(
            InfluencerCouponProviderMapping,
          );

          const savedCoupon = await couponRepository.save(
            couponRepository.create({
              partnerId: null,
              couponCode: params.couponCode,
              ownerType: InfluencerCouponOwnerType.PRODUCT,
              userDiscountPercentage: discountPercentage,
              influencerSharePercentage: 0,
              lifetimeAssociationEnabled: false,
              status: InfluencerCouponStatus.ACTIVE,
              startsAt: null,
              expiresAt: null,
              notes:
                'Auto-created from product coupon configuration. Override with a manual mapping if the discounted provider product ID is different.',
            }),
          );

          await mappingRepository.save(
            mappingRepository.create({
              couponId: savedCoupon.id,
              productDomain: params.productDomain,
              courseId:
                params.productDomain === InfluencerCouponProductDomain.COURSE
                  ? params.productId
                  : null,
              storePackageId:
                params.productDomain ===
                InfluencerCouponProductDomain.STORE_PACKAGE
                  ? params.productId
                  : null,
              provider: params.provider,
              regularProviderProductId,
              discountedProviderProductId: this.buildCouponProviderProductId(
                regularProviderProductId,
              ),
              providerBasePlanId: null,
              providerOfferId: null,
              isActive: true,
            }),
          );

          return couponRepository.findOneOrFail({
            where: { id: savedCoupon.id },
            relations: ['partner', 'providerMappings'],
          });
        },
      );

      return this.resolveStoredCoupon({
        coupon: createdCoupon,
        productDomain: params.productDomain,
        productId: params.productId,
        provider: params.provider,
        regularProviderProductId,
        basePriceEur: params.basePriceEur,
      });
    }

    if (coupon.ownerType === InfluencerCouponOwnerType.PRODUCT) {
      const hasMatchingMapping = (coupon.providerMappings ?? []).some(
        (item) => {
          const productMatches =
            params.productDomain === InfluencerCouponProductDomain.COURSE
              ? item.courseId === params.productId
              : item.storePackageId === params.productId;

          return (
            item.isActive &&
            item.productDomain === params.productDomain &&
            productMatches &&
            item.provider === params.provider
          );
        },
      );

      if (!hasMatchingMapping) {
        const regularProviderProductId =
          params.regularProviderProductId?.trim();

        if (!regularProviderProductId) {
          throw new BadRequestException(
            'regularProviderProductId is required to resolve a product-owned coupon.',
          );
        }

        await this.mappingRepository.save(
          this.mappingRepository.create({
            couponId: coupon.id,
            productDomain: params.productDomain,
            courseId:
              params.productDomain === InfluencerCouponProductDomain.COURSE
                ? params.productId
                : null,
            storePackageId:
              params.productDomain ===
              InfluencerCouponProductDomain.STORE_PACKAGE
                ? params.productId
                : null,
            provider: params.provider,
            regularProviderProductId,
            discountedProviderProductId: this.buildCouponProviderProductId(
              regularProviderProductId,
            ),
            providerBasePlanId: null,
            providerOfferId: null,
            isActive: true,
          }),
        );

        coupon.providerMappings = await this.mappingRepository.find({
          where: { couponId: coupon.id },
        });
      }
    }

    return this.resolveStoredCoupon({
      coupon,
      productDomain: params.productDomain,
      productId: params.productId,
      provider: params.provider,
      regularProviderProductId: params.regularProviderProductId,
      basePriceEur: params.basePriceEur,
    });
  }

  private async getProductOwnCouponCode(
    productDomain: InfluencerCouponProductDomain,
    productId: string,
  ) {
    if (productDomain === InfluencerCouponProductDomain.COURSE) {
      const course = await this.courseRepository.findOne({
        where: { id: productId },
      });
      return course?.couponCode?.trim().toUpperCase() ?? null;
    }

    const storePackage = await this.storePackageRepository.findOne({
      where: { id: productId },
      relations: ['commerce'],
    });

    return storePackage?.commerce?.couponCode?.trim().toUpperCase() ?? null;
  }

  private async resolveBasePrice(dto: ValidateInfluencerCouponDto) {
    if (dto.orderSubtotalEur) {
      return this.formatMoney(
        this.parseMoney(dto.orderSubtotalEur, 'Subtotal'),
      );
    }

    if (dto.productDomain === InfluencerCouponProductDomain.COURSE) {
      const course = await this.courseRepository.findOne({
        where: { id: dto.productId },
      });

      if (!course) {
        throw new NotFoundException('Course not found.');
      }

      if (!course.price) {
        throw new BadRequestException(
          'This course has no paid price configured.',
        );
      }

      return this.formatMoney(this.parseMoney(course.price, 'Course price'));
    }

    const storePackage = await this.storePackageRepository.findOne({
      where: { id: dto.productId },
      relations: ['commerce'],
    });

    if (!storePackage) {
      throw new NotFoundException('Store package not found.');
    }

    return this.formatMoney(
      this.parseMoney(storePackage.commerce.priceEur, 'Package price'),
    );
  }

  private buildResolution(params: {
    coupon: InfluencerCoupon;
    mapping: InfluencerCouponProviderMapping;
    partnerDisplayName: string | null;
    basePriceEur: string;
  }): InfluencerCheckoutCouponResolution {
    const baseMinor = this.parseMoney(params.basePriceEur, 'Base price');
    const discountMinor = this.percentageAmount(
      baseMinor,
      params.coupon.userDiscountPercentage,
    );
    const payableMinor = baseMinor - discountMinor;

    return {
      valid: true,
      couponId: params.coupon.id,
      partnerId: params.coupon.partnerId,
      partnerDisplayName: params.partnerDisplayName,
      couponCode: params.coupon.couponCode,
      ownerType: params.coupon.ownerType,
      discountPercentage: params.coupon.userDiscountPercentage,
      influencerSharePercentage: params.coupon.influencerSharePercentage,
      lifetimeAssociationEnabled: params.coupon.lifetimeAssociationEnabled,
      startsAt: params.coupon.startsAt,
      expiresAt: params.coupon.expiresAt,
      provider: params.mapping.provider,
      regularProviderProductId: params.mapping.regularProviderProductId,
      discountedProviderProductId: params.mapping.discountedProviderProductId,
      providerBasePlanId: params.mapping.providerBasePlanId,
      providerOfferId: params.mapping.providerOfferId,
      basePriceEur: this.formatMoney(baseMinor),
      discountAmountEur: this.formatMoney(discountMinor),
      payableAmountEur: this.formatMoney(payableMinor),
      taxWarning: this.taxWarning,
    };
  }

  private assertCouponActive(coupon: InfluencerCoupon) {
    if (coupon.status !== InfluencerCouponStatus.ACTIVE) {
      throw new BadRequestException('Coupon is not active.');
    }

    const now = new Date();

    if (coupon.startsAt && coupon.startsAt.getTime() > now.getTime()) {
      throw new BadRequestException('Coupon is not active yet.');
    }

    if (coupon.expiresAt && coupon.expiresAt.getTime() < now.getTime()) {
      throw new BadRequestException('Coupon has expired.');
    }
  }

  private async upsertDealWithManager(
    manager: EntityManager,
    partnerId: string,
    dto: InfluencerDealDto,
  ) {
    this.assertValidDateWindow(dto.startsAt, dto.expiresAt);

    const couponRepository = manager.getRepository(InfluencerCoupon);
    const mappingRepository = manager.getRepository(
      InfluencerCouponProviderMapping,
    );

    const couponCode = dto.couponCode.trim().toUpperCase();

    if (this.parseCouponPercentage(couponCode) !== dto.userDiscountPercentage) {
      throw new BadRequestException(
        'Coupon code prefix must match the user discount percentage. Example: RAHIM20 must use 20%.',
      );
    }

    const existingByCode = await couponRepository.findOne({
      where: { couponCode },
    });

    if (existingByCode && existingByCode.partnerId !== partnerId) {
      throw new ConflictException(
        'Coupon code is already used by another partner or product.',
      );
    }

    const coupon = existingByCode ?? couponRepository.create({ couponCode });
    coupon.partnerId = partnerId;
    coupon.ownerType = dto.ownerType ?? InfluencerCouponOwnerType.INFLUENCER;
    coupon.userDiscountPercentage = dto.userDiscountPercentage;
    coupon.influencerSharePercentage = dto.influencerSharePercentage;
    coupon.lifetimeAssociationEnabled = dto.lifetimeAssociationEnabled ?? true;
    coupon.status = dto.status ?? InfluencerCouponStatus.ACTIVE;
    coupon.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    coupon.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    coupon.notes = dto.notes ?? null;

    const savedCoupon = await couponRepository.save(coupon);

    if (dto.providerMappings !== undefined) {
      await mappingRepository.delete({ couponId: savedCoupon.id });

      if (dto.providerMappings.length) {
        await mappingRepository.save(
          dto.providerMappings.map((item) =>
            mappingRepository.create({
              couponId: savedCoupon.id,
              ...this.normalizeProviderMapping(item),
            }),
          ),
        );
      }
    }
  }

  private normalizeProviderMapping(item: InfluencerProviderMappingDto) {
    const courseId =
      item.productDomain === InfluencerCouponProductDomain.COURSE
        ? item.courseId
        : null;
    const storePackageId =
      item.productDomain === InfluencerCouponProductDomain.STORE_PACKAGE
        ? item.storePackageId
        : null;

    if (
      item.productDomain === InfluencerCouponProductDomain.COURSE &&
      !courseId
    ) {
      throw new BadRequestException(
        'courseId is required for course coupon mappings.',
      );
    }

    if (
      item.productDomain === InfluencerCouponProductDomain.STORE_PACKAGE &&
      !storePackageId
    ) {
      throw new BadRequestException(
        'storePackageId is required for store package coupon mappings.',
      );
    }

    this.assertCouponProviderProductPrefix({
      regularProviderProductId: item.regularProviderProductId,
      discountedProviderProductId: item.discountedProviderProductId,
    });

    return {
      productDomain: item.productDomain,
      courseId: courseId ?? null,
      storePackageId: storePackageId ?? null,
      provider: item.provider,
      regularProviderProductId: item.regularProviderProductId.trim(),
      discountedProviderProductId: item.discountedProviderProductId.trim(),
      providerBasePlanId: item.providerBasePlanId ?? null,
      providerOfferId: item.providerOfferId ?? null,
      isActive: item.isActive ?? true,
    };
  }

  private assertValidDateWindow(
    startsAt?: string | null,
    expiresAt?: string | null,
  ) {
    if (!startsAt || !expiresAt) {
      return;
    }

    if (new Date(startsAt).getTime() >= new Date(expiresAt).getTime()) {
      throw new BadRequestException(
        'Coupon expiry date must be after the start date.',
      );
    }
  }

  private async getPartnerData(partnerId: string) {
    const partner = await this.partnerRepository.findOne({
      where: { id: partnerId },
      relations: ['socialHandles', 'coupons', 'coupons.providerMappings'],
    });

    if (!partner) {
      throw new NotFoundException('Influencer partner not found.');
    }

    const stats = await this.getPartnerStatsMap([partner.id]);
    const ledgerEntries = await this.ledgerRepository.find({
      where: { partnerId: partner.id },
      order: { transactionDate: 'DESC' },
      take: 20,
    });

    return {
      partner: this.mapPartnerDetail(partner),
      stats: stats.get(partner.id) ?? this.emptyPartnerStats(),
      payoutHistory: ledgerEntries.map((entry) => this.mapLedgerEntry(entry)),
    };
  }

  private mapPartnerListItem(partner: InfluencerPartner) {
    const primaryCoupon = (partner.coupons ?? [])[0] ?? null;

    return {
      id: partner.id,
      fullName: partner.fullName,
      email: partner.email,
      title: partner.title,
      avatarUrl: partner.avatarUrl,
      status: partner.status,
      paymentMethod: partner.paymentMethod,
      paymentDisplayLabel: partner.paymentDisplayLabel,
      currency: partner.currency,
      primaryCouponCode: primaryCoupon?.couponCode ?? null,
      userDiscountPercentage: primaryCoupon?.userDiscountPercentage ?? 0,
      influencerSharePercentage: primaryCoupon?.influencerSharePercentage ?? 0,
      couponStatus: primaryCoupon?.status ?? null,
      couponStartsAt: primaryCoupon?.startsAt ?? null,
      couponExpiresAt: primaryCoupon?.expiresAt ?? null,
      lastActivityAt: partner.lastActivityAt,
      createdAt: partner.createdAt,
      updatedAt: partner.updatedAt,
    };
  }

  private buildCouponProviderProductId(
    regularProviderProductId: string,
  ): string {
    const normalized = regularProviderProductId.trim();

    if (!normalized) {
      throw new BadRequestException(
        'Regular provider product ID is required to build coupon product ID.',
      );
    }

    if (normalized.toLowerCase().startsWith('coupon_')) {
      throw new BadRequestException(
        'Regular provider product ID must not start with coupon_.',
      );
    }

    return `coupon_${normalized}`;
  }

  private assertCouponProviderProductPrefix(params: {
    regularProviderProductId: string;
    discountedProviderProductId: string;
  }) {
    const expected = this.buildCouponProviderProductId(
      params.regularProviderProductId,
    );

    if (params.discountedProviderProductId.trim() !== expected) {
      throw new BadRequestException(
        `Discounted provider product ID must be "${expected}" for this coupon flow.`,
      );
    }
  }

  private mapPartnerDetail(partner: InfluencerPartner) {
    return {
      ...this.mapPartnerListItem(partner),
      administrativeNotes: partner.administrativeNotes,
      paymentDetails: partner.paymentDetails,
      socialHandles: [...(partner.socialHandles ?? [])]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((item) => ({
          id: item.id,
          platform: item.platform,
          handle: item.handle,
          url: item.url,
          sortOrder: item.sortOrder,
        })),
      deals: [...(partner.coupons ?? [])].map((coupon) => ({
        id: coupon.id,
        couponCode: coupon.couponCode,
        ownerType: coupon.ownerType,
        userDiscountPercentage: coupon.userDiscountPercentage,
        influencerSharePercentage: coupon.influencerSharePercentage,
        lifetimeAssociationEnabled: coupon.lifetimeAssociationEnabled,
        status: coupon.status,
        startsAt: coupon.startsAt,
        expiresAt: coupon.expiresAt,
        notes: coupon.notes,
        providerMappings: [...(coupon.providerMappings ?? [])].map(
          (mapping) => ({
            id: mapping.id,
            productDomain: mapping.productDomain,
            courseId: mapping.courseId,
            storePackageId: mapping.storePackageId,
            provider: mapping.provider,
            regularProviderProductId: mapping.regularProviderProductId,
            discountedProviderProductId: mapping.discountedProviderProductId,
            providerBasePlanId: mapping.providerBasePlanId,
            providerOfferId: mapping.providerOfferId,
            isActive: mapping.isActive,
          }),
        ),
      })),
    };
  }

  private mapCouponResolution(resolution: InfluencerCheckoutCouponResolution) {
    return {
      valid: resolution.valid,
      couponId: resolution.couponId,
      couponCode: resolution.couponCode,
      ownerType: resolution.ownerType,
      partnerId: resolution.partnerId,
      partnerDisplayName: resolution.partnerDisplayName,
      discountPercentage: resolution.discountPercentage,
      influencerSharePercentage: resolution.influencerSharePercentage,
      discountAmountEur: resolution.discountAmountEur,
      finalSubtotalEur: resolution.payableAmountEur,
      payableAmountEur: resolution.payableAmountEur,
      storeProduct: {
        provider: resolution.provider,
        regularProductId: resolution.regularProviderProductId,
        productId: resolution.discountedProviderProductId,
        basePlanId: resolution.providerBasePlanId,
        offerId: resolution.providerOfferId,
      },
      startsAt: resolution.startsAt,
      expiresAt: resolution.expiresAt,
      taxWarning: resolution.taxWarning,
      reasonCode: null,
    };
  }

  private mapLedgerEntry(entry: InfluencerLedgerEntry) {
    return {
      id: entry.id,
      partnerId: entry.partnerId,
      couponId: entry.couponId,
      attributionId: entry.attributionId,
      orderDomain: entry.orderDomain,
      orderId: entry.orderId,
      transactionType: entry.transactionType,
      referenceId: entry.referenceId,
      amountEur: entry.amountEur,
      status: entry.status,
      notes: entry.notes,
      transactionDate: entry.transactionDate,
      createdAt: entry.createdAt,
    };
  }

  private async getPartnerStatsMap(partnerIds: string[]) {
    const result = new Map<
      string,
      {
        usersLinked: number;
        totalSalesEur: string;
        commissionEarnedEur: string;
        commissionOwedEur: string;
      }
    >();

    partnerIds.forEach((id) => {
      result.set(id, {
        usersLinked: 0,
        totalSalesEur: '0.00',
        commissionEarnedEur: '0.00',
        commissionOwedEur: '0.00',
      });
    });

    if (!partnerIds.length) {
      return result;
    }

    const [attributions, ledgerEntries] = await Promise.all([
      this.attributionRepository
        .createQueryBuilder('item')
        .where('item.partnerId IN (:...partnerIds)', { partnerIds })
        .getMany(),
      this.ledgerRepository
        .createQueryBuilder('entry')
        .where('entry.partnerId IN (:...partnerIds)', { partnerIds })
        .getMany(),
    ]);

    for (const partnerId of partnerIds) {
      const converted = attributions.filter(
        (item) =>
          item.partnerId === partnerId &&
          item.status === InfluencerAttributionStatus.CONVERTED,
      );
      const pendingLedger = ledgerEntries.filter(
        (item) =>
          item.partnerId === partnerId &&
          item.status === InfluencerLedgerStatus.PENDING,
      );

      result.set(partnerId, {
        usersLinked: new Set(converted.map((item) => item.userId)).size,
        totalSalesEur: this.sumMoney(
          converted.map((item) => item.payableAmountEur),
        ),
        commissionEarnedEur: this.sumMoney(
          converted.map((item) => item.commissionAmountEur),
        ),
        commissionOwedEur: this.sumMoney(
          pendingLedger.map((item) => item.amountEur),
        ),
      });
    }

    return result;
  }

  private emptyPartnerStats() {
    return {
      usersLinked: 0,
      totalSalesEur: '0.00',
      commissionEarnedEur: '0.00',
      commissionOwedEur: '0.00',
    };
  }

  private buildMonthlyTrend(attributions: InfluencerOrderAttribution[]) {
    const trend = new Map<string, number>();

    for (const item of attributions) {
      const date = item.convertedAt ?? item.createdAt;
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      trend.set(
        key,
        (trend.get(key) ?? 0) +
          this.parseMoney(item.commissionAmountEur, 'Commission'),
      );
    }

    return [...trend.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, amountMinor]) => ({
        month,
        earningsEur: this.formatMoney(amountMinor),
      }));
  }

  private parseCouponPercentage(couponCode: string) {
    const match = couponCode
      .trim()
      .toUpperCase()
      .match(/(\d{2})$/);

    if (!match) {
      throw new BadRequestException(
        'Coupon code must end with a two-digit discount percentage.',
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

  private parseMoney(value: string, fieldName: string) {
    const normalized = `${value}`.trim();

    if (!/^-?\d{1,8}(?:\.\d{1,2})?$/.test(normalized)) {
      throw new BadRequestException(
        `${fieldName} must be a valid money amount.`,
      );
    }

    const negative = normalized.startsWith('-');
    const absolute = negative ? normalized.slice(1) : normalized;
    const [major, minor = ''] = absolute.split('.');
    const amount = Number(major) * 100 + Number(minor.padEnd(2, '0'));

    if (!Number.isSafeInteger(amount)) {
      throw new BadRequestException(`${fieldName} amount is too large.`);
    }

    return negative ? -amount : amount;
  }

  private formatMoney(amountMinor: number) {
    const negative = amountMinor < 0;
    const absolute = Math.abs(amountMinor);
    const major = Math.floor(absolute / 100);
    const minor = String(absolute % 100).padStart(2, '0');

    return `${negative ? '-' : ''}${major}.${minor}`;
  }

  private percentageAmount(amountMinor: number, percentage: number) {
    return Math.round((amountMinor * percentage) / 100);
  }

  private sumMoney(values: string[]) {
    return this.formatMoney(
      values.reduce((sum, value) => sum + this.parseMoney(value, 'Amount'), 0),
    );
  }

  private generateReference(prefix: string) {
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`;
  }

  private csv(value: string) {
    const escaped = `${value}`.replace(/"/g, '""');
    return `"${escaped}"`;
  }
}
