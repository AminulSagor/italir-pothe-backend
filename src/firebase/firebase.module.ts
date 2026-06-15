import { Module } from '@nestjs/common';
import { FirebaseAdminService } from './services/firebase-admin.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceToken } from './entities/device-token.entity';
import { DeviceTokensController } from './controllers/device-tokens.controller';
import { DeviceTokensService } from './services/device-tokens.service';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceToken])],
  controllers: [DeviceTokensController],
  providers: [FirebaseAdminService, DeviceTokensService],
  exports: [TypeOrmModule, FirebaseAdminService, DeviceTokensService],
})
export class FirebaseModule {}
