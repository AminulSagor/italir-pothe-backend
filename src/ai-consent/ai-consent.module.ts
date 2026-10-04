import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DevicesModule } from '../devices/devices.module';
import { AiConsentController } from './ai-consent.controller';
import { AiConsentGuard } from './ai-consent.guard';
import { AiConsentService } from './ai-consent.service';
import { UserAiConsent } from './entities/user-ai-consent.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserAiConsent]), DevicesModule],
  controllers: [AiConsentController],
  providers: [AiConsentService, AiConsentGuard],
  exports: [AiConsentService, AiConsentGuard],
})
export class AiConsentModule {}
