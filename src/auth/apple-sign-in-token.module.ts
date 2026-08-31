import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppleSignInTokenService } from './apple-sign-in-token.service';

@Module({
  imports: [ConfigModule],
  providers: [AppleSignInTokenService],
  exports: [AppleSignInTokenService],
})
export class AppleSignInTokenModule {}
