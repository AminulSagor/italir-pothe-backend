import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LearningActivityController } from './controllers/learning-activity.controller';
import { UserLearningActivityTimeEntry } from './entities/user-learning-activity-time-entry.entity';
import { LearningActivityService } from './services/learning-activity.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserLearningActivityTimeEntry])],
  controllers: [LearningActivityController],
  providers: [LearningActivityService],
  exports: [LearningActivityService],
})
export class LearningActivityModule {}
