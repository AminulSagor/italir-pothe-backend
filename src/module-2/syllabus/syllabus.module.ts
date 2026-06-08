import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Course } from '../courses/entities/course.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { AdminSyllabusController } from './controllers/admin-syllabus.controller';
import { SyllabusController } from './controllers/syllabus.controller';
import { CourseChapter } from './entities/course-chapter.entity';
import { AdminSyllabusService } from './services/admin-syllabus.service';
import { SyllabusService } from './services/syllabus.service';

@Module({
  imports: [TypeOrmModule.forFeature([Course, CourseChapter, Lesson])],
  controllers: [AdminSyllabusController, SyllabusController],
  providers: [AdminSyllabusService, SyllabusService],
  exports: [TypeOrmModule, AdminSyllabusService, SyllabusService],
})
export class SyllabusModule {}
