import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MailModule } from '../common/mail/mail.module';
import { SmsService } from '../common/services/sms.service';
import { UsersModule } from '../users/users.module';
import { Otp } from '../users/entities/otp.entity';
import { User } from '../users/entities/user.entity';

import { AccountDeletionController } from './account-deletion.controller';
import { AccountDeletionService } from './account-deletion.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Otp]), UsersModule, MailModule],
  controllers: [AccountDeletionController],
  providers: [AccountDeletionService, SmsService],
})
export class AccountDeletionModule {}
