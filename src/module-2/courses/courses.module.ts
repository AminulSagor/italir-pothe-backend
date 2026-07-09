import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CourseProviderProduct } from '../course-commerce/entities/course-provider-product.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { CourseChapter } from 'src/module-2/syllabus/entities/course-chapter.entity';
import { AdminCoursesController } from './controllers/admin-courses.controller';
import { CoursesController } from './controllers/courses.controller';
import { Course } from './entities/course.entity';
import { AdminCoursesService } from './services/admin-courses.service';
import { CoursesService } from './services/courses.service';
import { CourseEnrollment } from '../course-commerce/entities/course-enrollment.entity';
import { CoursePurchaseOrder } from '../course-commerce/entities/course-purchase-order.entity';
import { UserCourseProgress } from '../progress/entities/user-course-progress.entity';
import { UserCourseEnrollment } from './entities/user-course-enrollment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Course,
      CourseChapter,
      Lesson,
      CourseProviderProduct,
      CourseEnrollment,
      CoursePurchaseOrder,
      UserCourseProgress,
      UserCourseEnrollment,
    ]),
  ],
  controllers: [AdminCoursesController, CoursesController],
  providers: [AdminCoursesService, CoursesService],
  exports: [TypeOrmModule, AdminCoursesService, CoursesService],
})
export class CoursesModule {}
