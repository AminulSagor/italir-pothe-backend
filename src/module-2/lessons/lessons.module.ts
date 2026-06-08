import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FilesModule } from 'src/files/files.module';
import { CourseChapter } from '../syllabus/entities/course-chapter.entity';
import { AdminLessonsController } from './controllers/admin-lessons.controller';
import { LessonsController } from './controllers/lessons.controller';
import { LessonVocabulary } from './entities/lesson-vocabulary.entity';
import { Lesson } from './entities/lesson.entity';
import { AdminLessonsService } from './services/admin-lessons.service';
import { LessonsService } from './services/lessons.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CourseChapter, Lesson, LessonVocabulary]),
    FilesModule,
  ],
  controllers: [AdminLessonsController, LessonsController],
  providers: [AdminLessonsService, LessonsService],
  exports: [TypeOrmModule, AdminLessonsService, LessonsService],
})
export class LessonsModule {}
