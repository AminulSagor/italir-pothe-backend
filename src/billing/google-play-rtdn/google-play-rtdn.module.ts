import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GooglePlayBillingModule } from '../google-play/google-play-billing.module';

import { CourseCommerceModule } from 'src/module-2/course-commerce/course-commerce.module';
import { CourseOrderProviderTransaction } from 'src/module-2/course-commerce/entities/course-order-provider-transaction.entity';
import { CoursePurchaseOrder } from 'src/module-2/course-commerce/entities/course-purchase-order.entity';

import { PackageStoreModule } from 'src/package-store/package-store.module';
import { StoreOrderProviderTransaction } from 'src/package-store/entities/store-order-provider-transaction.entity';
import { StoreOrder } from 'src/package-store/entities/store-order.entity';

import { GooglePlayRtdnController } from './controllers/google-play-rtdn.controller';
import { GooglePlayRtdnEvent } from './entities/google-play-rtdn-event.entity';
import { GooglePlayRtdnAuthService } from './services/google-play-rtdn-auth.service';
import { GooglePlayRtdnCipherService } from './services/google-play-rtdn-cipher.service';
import { GooglePlayRtdnIngestionService } from './services/google-play-rtdn-ingestion.service';
import { GooglePlayRtdnProcessorService } from './services/google-play-rtdn-processor.service';
import { GooglePlaySubscriptionsModule } from '../google-play-subscriptions/google-play-subscriptions.module';

@Module({
  imports: [
    ConfigModule,

    GooglePlayBillingModule,

    GooglePlaySubscriptionsModule,

    CourseCommerceModule,

    PackageStoreModule,

    TypeOrmModule.forFeature([
      GooglePlayRtdnEvent,

      CoursePurchaseOrder,
      CourseOrderProviderTransaction,

      StoreOrder,
      StoreOrderProviderTransaction,
    ]),
  ],

  controllers: [GooglePlayRtdnController],

  providers: [
    GooglePlayRtdnAuthService,
    GooglePlayRtdnCipherService,
    GooglePlayRtdnIngestionService,
    GooglePlayRtdnProcessorService,
  ],

  exports: [
    GooglePlayRtdnIngestionService,
    GooglePlayRtdnProcessorService,
    GooglePlayRtdnCipherService,
  ],
})
export class GooglePlayRtdnModule {}
