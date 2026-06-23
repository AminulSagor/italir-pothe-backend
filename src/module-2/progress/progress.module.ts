import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DailyChallengesModule } from '../daily-challenges/daily-challenges.module';
import { ProgressController } from './controllers/progress.controller';
import { UserCourseProgress } from './entities/user-course-progress.entity';
import { UserLessonProgress } from './entities/user-lesson-progress.entity';
import { ProgressService } from './services/progress.service';
import { ScoringModule } from '../scoring/scoring.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserLessonProgress, UserCourseProgress]),
    DailyChallengesModule,
    ScoringModule,
    LeaderboardModule,
  ],
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
