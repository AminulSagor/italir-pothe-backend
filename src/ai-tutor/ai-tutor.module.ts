import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PackageStoreModule } from '../package-store/package-store.module';
import { AiTutorController } from './ai-tutor.controller';
import { AiTutorService } from './ai-tutor.service';
import { AiTutorUsageService } from './ai-tutor-usage.service';
import { AiTutorLearnerProfile } from './entities/ai-tutor-learner-profile.entity';
import { AiTutorVoiceUsageSession } from './entities/ai-tutor-voice-usage-session.entity';
import { AiTutorLiveSession } from './entities/ai-tutor-live-session.entity';
import { AiTutorLearningMemory } from './entities/ai-tutor-learning-memory.entity';
import { AiTutorLiveSessionService } from './ai-tutor-live-session.service';
import { GeminiLiveService } from './gemini-live.service';

@Module({
  imports: [
    PackageStoreModule,
    TypeOrmModule.forFeature([
      AiTutorLearnerProfile,
      AiTutorVoiceUsageSession,
      AiTutorLiveSession,
      AiTutorLearningMemory,
    ]),
  ],
  controllers: [AiTutorController],
  providers: [
    AiTutorService,
    AiTutorUsageService,
    AiTutorLiveSessionService,
    GeminiLiveService,
  ],
})
export class AiTutorModule {}
