import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DevicesModule } from '../devices/devices.module';
import { AiTutorLiveSession } from '../ai-tutor/entities/ai-tutor-live-session.entity';
import { AiTutorVoiceUsageSession } from '../ai-tutor/entities/ai-tutor-voice-usage-session.entity';
import { PackageStoreModule } from '../package-store/package-store.module';
import { AiConsentController } from './ai-consent.controller';
import { AiConsentGuard } from './ai-consent.guard';
import { AiConsentService } from './ai-consent.service';
import { UserAiConsent } from './entities/user-ai-consent.entity';
import { AiConsentSessionRevocationService } from './ai-consent-session-revocation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserAiConsent,
      AiTutorVoiceUsageSession,
      AiTutorLiveSession,
    ]),
    DevicesModule,
    PackageStoreModule,
  ],
  controllers: [AiConsentController],
  providers: [
    AiConsentService,
    AiConsentGuard,
    AiConsentSessionRevocationService,
  ],
  exports: [
    AiConsentService,
    AiConsentGuard,
    AiConsentSessionRevocationService,
  ],
})
export class AiConsentModule {}
