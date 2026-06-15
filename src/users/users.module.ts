import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { Otp } from './entities/otp.entity';
import { FilesModule } from 'src/files/files.module';
import { SmsService } from 'src/common/services/sms.service';
import { EmailService } from 'src/common/services/email.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Otp]), FilesModule],
  providers: [UsersService, SmsService, EmailService],
  controllers: [UsersController],
})
export class UsersModule {}
