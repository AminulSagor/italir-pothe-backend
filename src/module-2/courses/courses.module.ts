import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Lesson } from '../lessons/entities/lesson.entity';
import { CourseChapter } from 'src/module-2/syllabus/entities/course-chapter.entity';
import { AdminCoursesController } from './controllers/admin-courses.controller';
import { CoursesController } from './controllers/courses.controller';
import { Course } from './entities/course.entity';
import { AdminCoursesService } from './services/admin-courses.service';
import { CoursesService } from './services/courses.service';

@Module({
  imports: [TypeOrmModule.forFeature([Course, CourseChapter, Lesson])],
  controllers: [AdminCoursesController, CoursesController],
  providers: [AdminCoursesService, CoursesService],
  exports: [TypeOrmModule, AdminCoursesService, CoursesService],
})
export class CoursesModule {}
