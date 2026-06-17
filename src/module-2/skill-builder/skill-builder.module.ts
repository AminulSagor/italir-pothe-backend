import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FilesModule } from 'src/files/files.module';
import { DailyChallengesModule } from '../daily-challenges/daily-challenges.module';
import { AdminSkillBuilderController } from './controllers/admin-skill-builder.controller';
import { JobSentencesController } from './controllers/job-sentences.controller';
import { SkillBuilderController } from './controllers/skill-builder.controller';
import { CareerTrack } from './entities/career-track.entity';
import { SkillBuilderModuleEntity } from './entities/skill-builder-module.entity';
import { SkillBuilderSentence } from './entities/skill-builder-sentence.entity';
import { UserCareerTrackProgress } from './entities/user-career-track-progress.entity';
import { UserJobSentenceProgress } from './entities/user-job-sentence-progress.entity';
import { AdminSkillBuilderService } from './services/admin-skill-builder.service';
import { JobSentencesService } from './services/job-sentences.service';
import { SkillBuilderService } from './services/skill-builder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CareerTrack,
      SkillBuilderModuleEntity,
      SkillBuilderSentence,
      UserCareerTrackProgress,
      UserJobSentenceProgress,
    ]),
    FilesModule,
    DailyChallengesModule,
  ],
  controllers: [
    AdminSkillBuilderController,
    SkillBuilderController,
    JobSentencesController,
  ],
  providers: [
    AdminSkillBuilderService,
    SkillBuilderService,
    JobSentencesService,
  ],
  exports: [SkillBuilderService, JobSentencesService],
})
export class SkillBuilderModule {}
