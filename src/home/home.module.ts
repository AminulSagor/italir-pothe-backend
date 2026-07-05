import { Module } from '@nestjs/common';

import { DailyChallengesModule } from 'src/module-2/daily-challenges/daily-challenges.module';
import { LearningActivityModule } from 'src/module-2/learning-activity/learning-activity.module';
import { ProgressModule } from 'src/module-2/progress/progress.module';
import { SkillBuilderModule } from 'src/module-2/skill-builder/skill-builder.module';
import { WebinarModule } from 'src/webinar/webinar.module';
import { HomeDashboardController } from './controllers/home-dashboard.controller';
import { HomeDashboardService } from './services/home-dashboard.service';

@Module({
  imports: [
    LearningActivityModule,
    ProgressModule,
    SkillBuilderModule,
    WebinarModule,
    DailyChallengesModule,
  ],
  controllers: [HomeDashboardController],
  providers: [HomeDashboardService],
})
export class HomeModule {}
