import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { Otp } from './entities/otp.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Otp])],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
