import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PackageStoreModule } from '../package-store/package-store.module';
import { AiTutorController } from './ai-tutor.controller';
import { AiTutorService } from './ai-tutor.service';
import { AiTutorUsageService } from './ai-tutor-usage.service';
import { AiTutorLearnerProfile } from './entities/ai-tutor-learner-profile.entity';
import { AiTutorVoiceUsageSession } from './entities/ai-tutor-voice-usage-session.entity';

@Module({
  imports: [
    PackageStoreModule,
    TypeOrmModule.forFeature([
      AiTutorLearnerProfile,
      AiTutorVoiceUsageSession,
    ]),
  ],
  controllers: [AiTutorController],
  providers: [AiTutorService, AiTutorUsageService],
})
export class AiTutorModule {}
