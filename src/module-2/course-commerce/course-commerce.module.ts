import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from 'src/users/entities/user.entity';
import { Course } from '../courses/entities/course.entity';
import { AdminCourseCommerceController } from './controllers/admin-course-commerce.controller';
import { CourseCommerceController } from './controllers/course-commerce.controller';
import { CourseEnrollment } from './entities/course-enrollment.entity';
import { CourseOrderProviderSnapshot } from './entities/course-order-provider-snapshot.entity';
import { CourseOrderProviderTransaction } from './entities/course-order-provider-transaction.entity';
import { CoursePaymentAttempt } from './entities/course-payment-attempt.entity';
import { CoursePurchaseOrder } from './entities/course-purchase-order.entity';
import { CourseProviderProduct } from './entities/course-provider-product.entity';
import { DemoForexRateService } from './providers/demo-forex-rate.service';
import { DemoPaymentGatewayService } from './providers/demo-payment-gateway.service';
import { FOREX_RATE_PROVIDER } from './providers/forex-rate-provider';
import { AdminCourseCommerceService } from './services/admin-course-commerce.service';
import { CourseCommerceService } from './services/course-commerce.service';
import { StorePackageProviderProduct } from 'src/package-store/entities/store-package-provider-product.entity';
import { StoreOrderProviderTransaction } from 'src/package-store/entities/store-order-provider-transaction.entity';
import { GooglePlayBillingModule } from 'src/billing/google-play/google-play-billing.module';
import { ProviderRefundOperation } from 'src/billing/entities/provider-refund-operation.entity';
import { AppStoreCoreModule } from 'src/billing/app-store/app-store-core.module';

@Module({
  imports: [
    ConfigModule,
    GooglePlayBillingModule,
    AppStoreCoreModule,

    TypeOrmModule.forFeature([
      User,
      Course,
      CoursePurchaseOrder,
      CoursePaymentAttempt,
      CourseEnrollment,
      CourseProviderProduct,
      CourseOrderProviderSnapshot,
      CourseOrderProviderTransaction,

      StorePackageProviderProduct,
      StoreOrderProviderTransaction,

      ProviderRefundOperation,
    ]),
  ],
  controllers: [CourseCommerceController, AdminCourseCommerceController],
  providers: [
    DemoForexRateService,
    {
      provide: FOREX_RATE_PROVIDER,
      useExisting: DemoForexRateService,
    },
    DemoPaymentGatewayService,
    CourseCommerceService,
    AdminCourseCommerceService,
  ],
  exports: [CourseCommerceService, AdminCourseCommerceService],
})
export class CourseCommerceModule {}
