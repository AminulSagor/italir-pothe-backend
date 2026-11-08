import { BadRequestException, ConflictException } from '@nestjs/common';

import {
  CreateStorePackageDto,
  CreateStoreProviderProductDto,
} from '../dto/package-store.dto';
import {
  StoreBillingModel,
  StorePackageType,
  StorePaymentProvider,
  StoreProviderProductType,
} from '../types/package-store.type';
import { PackageStoreService } from './package-store.service';

describe('PackageStoreService Ad-Free validation', () => {
  const validate = (dto: CreateStorePackageDto): void =>
    (
      Object.create(PackageStoreService.prototype) as unknown as {
        validateAdFreePackageCreation(input: CreateStorePackageDto): void;
      }
    ).validateAdFreePackageCreation(dto);

  const mapping = (
    provider: StorePaymentProvider,
  ): CreateStoreProviderProductDto => ({
    provider,
    productId:
      provider === StorePaymentProvider.APP_STORE
        ? 'com.italirpothe.adfree.monthly'
        : 'ad_free',
    productType: StoreProviderProductType.SUBSCRIPTION,
    basePlanId:
      provider === StorePaymentProvider.GOOGLE_PLAY ? 'monthly' : undefined,
    isActive: true,
  });

  const monthly = (): CreateStorePackageDto => ({
    packageType: StorePackageType.AD_FREE,
    name: 'Ad-Free Monthly',
    priceEur: '1.99',
    billingModel: StoreBillingModel.MONTHLY,
    couponsEnabled: false,
    providerProducts: [
      mapping(StorePaymentProvider.APP_STORE),
      mapping(StorePaymentProvider.GOOGLE_PLAY),
    ],
  });

  it('accepts the exact monthly plan with Apple and Google mappings', () => {
    expect(() => validate(monthly())).not.toThrow();
  });

  it('accepts the exact yearly plan', () => {
    const dto = monthly();
    dto.name = 'Ad-Free Yearly';
    dto.priceEur = '15.00';
    dto.billingModel = StoreBillingModel.YEARLY;
    dto.providerProducts![0].productId = 'com.italirpothe.adfree.yearly';
    dto.providerProducts![1].basePlanId = 'yearly';
    expect(() => validate(dto)).not.toThrow();
  });

  it('rejects unsupported billing models and coupon configuration', () => {
    const oneTime = monthly();
    oneTime.billingModel = StoreBillingModel.ONE_TIME;
    expect(() => validate(oneTime)).toThrow(BadRequestException);

    const coupon = monthly();
    coupon.couponsEnabled = true;
    coupon.couponCode = 'SAVE';
    expect(() => validate(coupon)).toThrow(BadRequestException);
  });

  it('requires one subscription mapping per store and a Google base plan', () => {
    const missingBasePlan = monthly();
    missingBasePlan.providerProducts![1].basePlanId = undefined;
    expect(() => validate(missingBasePlan)).toThrow(BadRequestException);

    const nonConsumable = monthly();
    nonConsumable.providerProducts![0].productType =
      StoreProviderProductType.NON_CONSUMABLE;
    expect(() => validate(nonConsumable)).toThrow(BadRequestException);
  });

  it('rejects a second non-deleted package with the same duration', async () => {
    const query = {
      innerJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      getOne: jest.fn(async () => ({ id: 'existing-monthly-package' })),
    };
    query.innerJoin.mockReturnValue(query);
    query.where.mockReturnValue(query);
    query.andWhere.mockReturnValue(query);
    const manager = {
      query: jest.fn(async () => undefined),
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => query),
      })),
    };
    const service = Object.assign(
      Object.create(PackageStoreService.prototype),
      {
        dataSource: {
          transaction: jest.fn(
            async (work: (value: typeof manager) => Promise<unknown>) =>
              work(manager),
          ),
        },
      },
    ) as PackageStoreService;

    await expect(service.createPackage(monthly())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
