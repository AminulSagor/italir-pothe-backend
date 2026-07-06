import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { GooglePlayBillingService } from './google-play-billing.service';

@Module({
  imports: [ConfigModule],
  providers: [GooglePlayBillingService],
  exports: [GooglePlayBillingService],
})
export class GooglePlayBillingModule {}
