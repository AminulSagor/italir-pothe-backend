import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ScoringModule } from '../scoring/scoring.module';
import { DailyChallengesController } from './controllers/daily-challenges.controller';
import { DailyChallengePlan } from './entities/daily-challenge-plan.entity';
import { UserDailyChallengeProgress } from './entities/user-daily-challenge-progress.entity';
import { UserDailyChestReward } from './entities/user-daily-chest-reward.entity';
import { DailyChallengesService } from './services/daily-challenges.service';
import { DailyChallengePlanTask } from './entities/daily-challenge-plan-task.entity';
import { DailyLearningActivityLog } from './entities/daily-learning-activity-log.entity';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DailyChallengePlan,
      DailyChallengePlanTask,
      DailyLearningActivityLog,
      UserDailyChallengeProgress,
      UserDailyChestReward,
    ]),
    ScoringModule,
    LeaderboardModule,
  ],
  controllers: [DailyChallengesController],
  providers: [DailyChallengesService],
  exports: [TypeOrmModule, DailyChallengesService],
})
export class DailyChallengesModule {}
