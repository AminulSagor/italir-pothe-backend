import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GooglePlayBillingModule } from '../google-play/google-play-billing.module';
import { GooglePlayRtdnModule } from '../google-play-rtdn/google-play-rtdn.module';
import { GooglePlaySubscriptionsModule } from '../google-play-subscriptions/google-play-subscriptions.module';

import { CourseCommerceModule } from 'src/module-2/course-commerce/course-commerce.module';
import { CourseOrderProviderTransaction } from 'src/module-2/course-commerce/entities/course-order-provider-transaction.entity';

import { PackageStoreModule } from 'src/package-store/package-store.module';
import { StoreOrderProviderTransaction } from 'src/package-store/entities/store-order-provider-transaction.entity';

import { AdminGooglePlayReconciliationController } from './controllers/admin-google-play-reconciliation.controller';
import { GooglePlayReconciliationCheckpoint } from './entities/google-play-reconciliation-checkpoint.entity';
import { GooglePlayVoidedPurchaseRecord } from './entities/google-play-voided-purchase-record.entity';
import { GooglePlayReconciliationService } from './services/google-play-reconciliation.service';

@Module({
  imports: [
    ConfigModule,

    GooglePlayBillingModule,

    GooglePlayRtdnModule,

    GooglePlaySubscriptionsModule,

    CourseCommerceModule,

    PackageStoreModule,

    TypeOrmModule.forFeature([
      GooglePlayReconciliationCheckpoint,

      GooglePlayVoidedPurchaseRecord,

      CourseOrderProviderTransaction,

      StoreOrderProviderTransaction,
    ]),
  ],

  controllers: [AdminGooglePlayReconciliationController],

  providers: [GooglePlayReconciliationService],

  exports: [GooglePlayReconciliationService],
})
export class GooglePlayReconciliationModule {}
