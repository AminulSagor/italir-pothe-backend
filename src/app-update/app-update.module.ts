import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  AdminAppUpdateController,
  PublicAppUpdateController,
} from './app-update.controller';
import { AppUpdateService } from './app-update.service';
import { AppUpdateConfiguration } from './entities/app-update-configuration.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AppUpdateConfiguration])],
  controllers: [PublicAppUpdateController, AdminAppUpdateController],
  providers: [AppUpdateService],
  exports: [AppUpdateService],
})
export class AppUpdateModule {}
