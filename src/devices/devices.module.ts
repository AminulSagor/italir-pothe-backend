import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DeviceController } from './controllers/user-device.controller';
import { UserDevice } from './entities/user-device.entity';
import { UserDeviceService } from './services/user-device.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserDevice])],
  controllers: [DeviceController],
  providers: [UserDeviceService],
  exports: [UserDeviceService],
})
export class DevicesModule {}
