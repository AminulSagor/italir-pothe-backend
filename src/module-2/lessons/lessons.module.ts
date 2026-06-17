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
import { UserVocabularyProgress } from './entities/user-vocabulary-progress.entity';
import { VocabularyReviewSession } from './entities/vocabulary-review-session.entity';
import { VocabularyReviewSessionItem } from './entities/vocabulary-review-session-item.entity';
import { VocabularyFlashcardsController } from './controllers/vocabulary-flashcards.controller';
import { VocabularyFlashcardsService } from './services/vocabulary-flashcards.service';
import { DailyChallengesModule } from '../daily-challenges/daily-challenges.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CourseChapter,
      Lesson,
      LessonVocabulary,
      UserVocabularyProgress,
      VocabularyReviewSession,
      VocabularyReviewSessionItem,
    ]),
    FilesModule,
    DailyChallengesModule,
  ],
  controllers: [
    AdminLessonsController,
    LessonsController,
    VocabularyFlashcardsController,
  ],
  providers: [AdminLessonsService, LessonsService, VocabularyFlashcardsService],
  exports: [
    TypeOrmModule,
    AdminLessonsService,
    LessonsService,
    VocabularyFlashcardsService,
  ],
})
export class LessonsModule {}
