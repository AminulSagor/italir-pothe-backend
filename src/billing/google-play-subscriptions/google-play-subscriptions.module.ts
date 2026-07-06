import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GooglePlayBillingModule } from '../google-play/google-play-billing.module';

import { StoreSubscriptionRenewal } from './entities/store-subscription-renewal.entity';
import { StoreSubscription } from './entities/store-subscription.entity';
import { GooglePlaySubscriptionLifecycleService } from './services/google-play-subscription-lifecycle.service';
import { GooglePlaySubscriptionTokenCipherService } from './services/google-play-subscription-token-cipher.service';

import { StoreOrder } from 'src/package-store/entities/store-order.entity';
import { StoreOrderProviderTransaction } from 'src/package-store/entities/store-order-provider-transaction.entity';
import { UserStoreWallet } from 'src/package-store/entities/user-store-wallet.entity';

@Module({
  imports: [
    ConfigModule,

    GooglePlayBillingModule,

    TypeOrmModule.forFeature([
      StoreSubscription,
      StoreSubscriptionRenewal,

      StoreOrder,
      StoreOrderProviderTransaction,
      UserStoreWallet,
    ]),
  ],

  providers: [
    GooglePlaySubscriptionTokenCipherService,
    GooglePlaySubscriptionLifecycleService,
  ],

  exports: [GooglePlaySubscriptionLifecycleService],
})
export class GooglePlaySubscriptionsModule {}
