import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StoreSubscription } from 'src/billing/google-play-subscriptions/entities/store-subscription.entity';
import { StoreSubscriptionRenewal } from 'src/billing/google-play-subscriptions/entities/store-subscription-renewal.entity';

import { StoreOrder } from 'src/package-store/entities/store-order.entity';
import { UserStoreWallet } from 'src/package-store/entities/user-store-wallet.entity';

import { AppStoreBillingService } from './services/app-store-billing.service';
import { AppStorePayloadCipherService } from './services/app-store-payload-cipher.service';
import { AppStoreSubscriptionLifecycleService } from './services/app-store-subscription-lifecycle.service';

@Module({
  imports: [
    ConfigModule,

    TypeOrmModule.forFeature([
      StoreSubscription,
      StoreSubscriptionRenewal,

      StoreOrder,
      UserStoreWallet,
    ]),
  ],

  providers: [
    AppStoreBillingService,

    AppStorePayloadCipherService,

    AppStoreSubscriptionLifecycleService,
  ],

  exports: [
    AppStoreBillingService,

    AppStorePayloadCipherService,

    AppStoreSubscriptionLifecycleService,
  ],
})
export class AppStoreCoreModule {}
