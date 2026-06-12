import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../users/entities/user.entity';
import { UserBlock } from './entities/user-block.entity';
import { UserBlocksController } from './user-blocks.controller';
import { UserBlocksService } from './user-blocks.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserBlock, User])],
  controllers: [UserBlocksController],
  providers: [UserBlocksService],
  exports: [UserBlocksService],
})
export class UserBlocksModule {}
