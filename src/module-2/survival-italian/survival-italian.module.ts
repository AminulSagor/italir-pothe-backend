import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FilesModule } from 'src/files/files.module';
import { DailyChallengesModule } from '../daily-challenges/daily-challenges.module';
import { AdminSurvivalController } from './controllers/admin-survival.controller';
import { SurvivalController } from './controllers/survival.controller';
import { SurvivalSituation } from './entities/survival-situation.entity';
import { UserSurvivalProgress } from './entities/user-survival-progress.entity';
import { AdminSurvivalService } from './services/admin-survival.service';
import { SurvivalService } from './services/survival.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SurvivalSituation, UserSurvivalProgress]),
    FilesModule,
    DailyChallengesModule,
  ],
  controllers: [AdminSurvivalController, SurvivalController],
  providers: [AdminSurvivalService, SurvivalService],
  exports: [SurvivalService],
})
export class SurvivalItalianModule {}
