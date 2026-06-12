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
  controllers: [UsersController],
})
export class UsersModule {}
