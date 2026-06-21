import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from 'src/users/entities/user.entity';
import { Course } from '../courses/entities/course.entity';
import { AdminCourseCommerceController } from './controllers/admin-course-commerce.controller';
import { CourseCommerceController } from './controllers/course-commerce.controller';
import { CourseEnrollment } from './entities/course-enrollment.entity';
import { CoursePaymentAttempt } from './entities/course-payment-attempt.entity';
import { CoursePurchaseOrder } from './entities/course-purchase-order.entity';
import { DemoForexRateService } from './providers/demo-forex-rate.service';
import { DemoPaymentGatewayService } from './providers/demo-payment-gateway.service';
import { FOREX_RATE_PROVIDER } from './providers/forex-rate-provider';
import { AdminCourseCommerceService } from './services/admin-course-commerce.service';
import { CourseCommerceService } from './services/course-commerce.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      User,
      Course,
      CoursePurchaseOrder,
      CoursePaymentAttempt,
      CourseEnrollment,
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
