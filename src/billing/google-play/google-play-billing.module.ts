import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { GooglePlayBillingService } from './google-play-billing.service';

@Global()
@Module({
  imports: [ConfigModule],

  providers: [GooglePlayBillingService],

  exports: [GooglePlayBillingService],
})
export class GooglePlayBillingModule {}
