import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { Otp } from './entities/otp.entity';
import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Otp]), PresenceModule],
  providers: [UsersService],
import { FilesModule } from 'src/files/files.module';
import { SmsService } from 'src/notifications/sms.service';
import { EmailService } from 'src/notifications/email.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Otp]), FilesModule],
  providers: [UsersService, SmsService, EmailService],
  controllers: [UsersController],
})
export class UsersModule {}
