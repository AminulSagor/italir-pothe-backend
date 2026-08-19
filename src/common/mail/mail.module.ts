import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmailService } from '../services/email.service';
import { EmailSuppression } from './entities/email-suppression.entity';
import { OtpRateLimitEvent } from './entities/otp-rate-limit-event.entity';
import { EmailSuppressionService } from './email-suppression.service';
import { OtpRateLimitService } from './otp-rate-limit.service';
import { ZeptoMailWebhookController } from './zeptomail-webhook.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EmailSuppression, OtpRateLimitEvent])],
  controllers: [ZeptoMailWebhookController],
  providers: [EmailService, EmailSuppressionService, OtpRateLimitService],
  exports: [EmailService, OtpRateLimitService],
})
export class MailModule {}
