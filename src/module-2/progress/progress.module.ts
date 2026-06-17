import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DailyChallengesModule } from '../daily-challenges/daily-challenges.module';
import { ProgressController } from './controllers/progress.controller';
import { UserCourseProgress } from './entities/user-course-progress.entity';
import { UserLessonProgress } from './entities/user-lesson-progress.entity';
import { ProgressService } from './services/progress.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserLessonProgress, UserCourseProgress]),
    DailyChallengesModule,
  ],
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
