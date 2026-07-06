import { Module, ServiceUnavailableException } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FilesModule } from 'src/files/files.module';
import { CoursePurchaseOrder } from 'src/module-2/course-commerce/entities/course-purchase-order.entity';
import { FOREX_RATE_PROVIDER } from 'src/module-2/course-commerce/providers/forex-rate-provider';
import type { ForexRateProvider } from 'src/module-2/course-commerce/providers/forex-rate-provider';
import { UserStreak } from 'src/module-2/scoring/entities/user-streak.entity';
import { User } from 'src/users/entities/user.entity';

import { AdminPackageStoreController } from './controllers/admin-package-store.controller';
import { PackageStoreController } from './controllers/package-store.controller';

import { CvEconomyConfig } from './entities/cv-economy-config.entity';
import { StoreOrder } from './entities/store-order.entity';
import { StoreOrderPackageSnapshot } from './entities/store-order-package-snapshot.entity';
import { StoreOrderPayment } from './entities/store-order-payment.entity';
import { StoreOrderProviderSnapshot } from './entities/store-order-provider-snapshot.entity';
import { StoreOrderProviderTransaction } from './entities/store-order-provider-transaction.entity';
import { StoreOrderPricing } from './entities/store-order-pricing.entity';
import { StoreOrderReversal } from './entities/store-order-reversal.entity';
import { StoreOrderTimelineEvent } from './entities/store-order-timeline-event.entity';
import { StorePackage } from './entities/store-package.entity';
import { StorePackageCommerce } from './entities/store-package-commerce.entity';
import { StorePackageEntitlement } from './entities/store-package-entitlement.entity';
import { StorePackageProviderProduct } from './entities/store-package-provider-product.entity';
import { UserStoreWallet } from './entities/user-store-wallet.entity';

import { PackageStoreService } from './services/package-store.service';
import { StoreWalletService } from './services/store-wallet.service';
import { CourseProviderProduct } from 'src/module-2/course-commerce/entities/course-provider-product.entity';
import { CourseOrderProviderTransaction } from 'src/module-2/course-commerce/entities/course-order-provider-transaction.entity';
import { GooglePlayBillingModule } from 'src/billing/google-play/google-play-billing.module';
import { ProviderRefundOperation } from 'src/billing/entities/provider-refund-operation.entity';
import { GooglePlaySubscriptionsModule } from 'src/billing/google-play-subscriptions/google-play-subscriptions.module';
import { AppStoreCoreModule } from 'src/billing/app-store/app-store-core.module';

const packageStoreForexRateProvider: Provider = {
  provide: FOREX_RATE_PROVIDER,

  inject: [ConfigService],

  useFactory: (configService: ConfigService): ForexRateProvider => ({
    async getEurToBdtRate(): Promise<string> {
      const configuredRate = configService
        .get<string>('DEMO_EUR_TO_BDT_RATE')
        ?.trim();

      const rate = Number(configuredRate);

      if (!Number.isFinite(rate) || rate <= 0) {
        throw new ServiceUnavailableException(
          'DEMO_EUR_TO_BDT_RATE is missing or invalid.',
        );
      }

      return rate.toFixed(4);
    },
  }),
};

@Module({
  imports: [
    ConfigModule,
    FilesModule,
    GooglePlayBillingModule,
    GooglePlaySubscriptionsModule,
    AppStoreCoreModule,

    TypeOrmModule.forFeature([
      User,
      UserStreak,

      StorePackage,
      StorePackageCommerce,
      StorePackageEntitlement,
      StorePackageProviderProduct,

      StoreOrder,
      StoreOrderPackageSnapshot,
      StoreOrderPricing,
      StoreOrderPayment,
      StoreOrderProviderSnapshot,
      StoreOrderProviderTransaction,
      StoreOrderReversal,
      StoreOrderTimelineEvent,

      UserStoreWallet,
      CvEconomyConfig,

      CoursePurchaseOrder,
      CourseProviderProduct,
      CourseOrderProviderTransaction,

      ProviderRefundOperation,
    ]),
  ],

  controllers: [PackageStoreController, AdminPackageStoreController],

  providers: [
    packageStoreForexRateProvider,
    StoreWalletService,
    PackageStoreService,
  ],

  exports: [StoreWalletService, PackageStoreService],
})
export class PackageStoreModule {}
