import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DailyChallengesModule } from '../daily-challenges/daily-challenges.module';
import { ImportantVerbsController } from './controllers/important-verbs.controller';
import { UserImportantVerbProgress } from './entities/user-important-verb-progress.entity';
import { ImportantVerbsService } from './services/important-verbs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserImportantVerbProgress]),
    DailyChallengesModule,
  ],
  controllers: [ImportantVerbsController],
  providers: [ImportantVerbsService],
  exports: [ImportantVerbsService],
})
export class ImportantVerbsModule {}
