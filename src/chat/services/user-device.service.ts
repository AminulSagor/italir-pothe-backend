import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserDevice } from '../entities/user-device.entity';
import { RegisterDeviceDto } from '../dto/register-device.dto';
import { DeviceAppState } from '../enums/chat.enums';

@Injectable()
export class UserDeviceService {
  constructor(
    @InjectRepository(UserDevice)
    private readonly userDeviceRepository: Repository<UserDevice>,
  ) {}

  async registerDevice(
    userId: string,
    dto: RegisterDeviceDto,
  ): Promise<UserDevice> {
    const fcmToken = dto.fcmToken?.trim();
    const voipToken = dto.voipToken?.trim();

    if (!fcmToken && !voipToken) {
      throw new BadRequestException('fcmToken or voipToken is required');
    }

    let device = await this.userDeviceRepository.findOne({
      where: {
        userId,
        deviceId: dto.deviceId,
      },
    });

    if (!device) {
      device = this.userDeviceRepository.create({
        userId,
        deviceId: dto.deviceId,
        platform: dto.platform,
        appState: dto.appState ?? DeviceAppState.FOREGROUND,
        fcmToken: fcmToken ?? null,
        voipToken: voipToken ?? null,
        isActive: true,
        lastActiveAt: new Date(),
      });

      return this.userDeviceRepository.save(device);
    }

    device.platform = dto.platform;
    device.appState =
      dto.appState ?? device.appState ?? DeviceAppState.FOREGROUND;

    if (fcmToken) {
      device.fcmToken = fcmToken;
    }

    if (voipToken) {
      device.voipToken = voipToken;
    }

    device.isActive = true;
    device.lastActiveAt = new Date();

    return this.userDeviceRepository.save(device);
  }

  async deactivateDevice(userId: string, deviceId: string): Promise<void> {
    await this.userDeviceRepository.update(
      {
        userId,
        deviceId,
      },
      {
        isActive: false,
        appState: DeviceAppState.TERMINATED,
        lastActiveAt: new Date(),
      },
    );
  }

  async getActiveDevicesByUserId(userId: string): Promise<UserDevice[]> {
    return this.userDeviceRepository.find({
      where: {
        userId,
        isActive: true,
      },
      order: {
        updatedAt: 'DESC',
      },
    });
  }
}
