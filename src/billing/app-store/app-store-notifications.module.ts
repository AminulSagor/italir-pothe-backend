import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CourseCommerceModule } from 'src/module-2/course-commerce/course-commerce.module';

import { CourseEnrollment } from 'src/module-2/course-commerce/entities/course-enrollment.entity';
import { CourseOrderProviderTransaction } from 'src/module-2/course-commerce/entities/course-order-provider-transaction.entity';
import { CoursePaymentAttempt } from 'src/module-2/course-commerce/entities/course-payment-attempt.entity';
import { CoursePurchaseOrder } from 'src/module-2/course-commerce/entities/course-purchase-order.entity';

import { PackageStoreModule } from 'src/package-store/package-store.module';

import { StoreOrder } from 'src/package-store/entities/store-order.entity';
import { StoreOrderPayment } from 'src/package-store/entities/store-order-payment.entity';
import { StoreOrderProviderTransaction } from 'src/package-store/entities/store-order-provider-transaction.entity';
import { StoreOrderTimelineEvent } from 'src/package-store/entities/store-order-timeline-event.entity';

import { AppStoreCoreModule } from './app-store-core.module';

import { AppStoreNotificationController } from './controllers/app-store-notification.controller';

import { AppStoreServerNotificationEvent } from './entities/app-store-server-notification-event.entity';
import { AppStoreNotificationService } from './services/app-store-notification.service';

@Module({
  imports: [
    AppStoreCoreModule,

    CourseCommerceModule,

    PackageStoreModule,

    TypeOrmModule.forFeature([
      AppStoreServerNotificationEvent,

      CoursePurchaseOrder,
      CourseOrderProviderTransaction,
      CourseEnrollment,
      CoursePaymentAttempt,

      StoreOrder,
      StoreOrderPayment,
      StoreOrderProviderTransaction,
      StoreOrderTimelineEvent,
    ]),
  ],

  controllers: [AppStoreNotificationController],

  providers: [AppStoreNotificationService],

  exports: [AppStoreNotificationService],
})
export class AppStoreNotificationsModule {}
