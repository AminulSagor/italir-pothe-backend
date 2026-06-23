import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  DeactivateDeviceDto,
  RegisterDeviceDto,
} from '../dto/register-device.dto';
import { UserDevice } from '../entities/user-device.entity';
import { DeviceAppState } from '../enums/device.enums';

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
    const deviceId = dto.deviceId.trim();
    const fcmToken = dto.fcmToken?.trim() || null;
    const voipToken = dto.voipToken?.trim() || null;
    const appVersion = dto.appVersion?.trim() || null;
    const timezone = dto.timezone?.trim() || null;

    if (!fcmToken && !voipToken) {
      throw new BadRequestException('fcmToken or voipToken is required');
    }

    /*
     * A physical device should not stay registered to an
     * older account after another user logs in on that device.
     */
    await this.deactivateOtherUsersForDevice(userId, deviceId);

    if (fcmToken) {
      await this.detachFcmTokenFromOtherDevices({
        userId,
        deviceId,
        fcmToken,
      });
    }

    if (voipToken) {
      await this.detachVoipTokenFromOtherDevices({
        userId,
        deviceId,
        voipToken,
      });
    }

    let device = await this.userDeviceRepository.findOne({
      where: {
        userId,
        deviceId,
      },
    });

    if (!device) {
      device = this.userDeviceRepository.create({
        userId,
        deviceId,
        platform: dto.platform,
        appState: dto.appState ?? DeviceAppState.FOREGROUND,
        fcmToken,
        voipToken,
        appVersion,
        timezone,
        isActive: true,
        lastActiveAt: new Date(),
        deactivatedAt: null,
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

    if (appVersion) {
      device.appVersion = appVersion;
    }

    if (timezone) {
      device.timezone = timezone;
    }

    device.isActive = true;
    device.lastActiveAt = new Date();
    device.deactivatedAt = null;

    return this.userDeviceRepository.save(device);
  }

  async deactivateDevice(
    userId: string,
    dto: DeactivateDeviceDto,
  ): Promise<void> {
    await this.userDeviceRepository.update(
      {
        userId,
        deviceId: dto.deviceId.trim(),
      },
      {
        fcmToken: null,
        voipToken: null,
        isActive: false,
        appState: DeviceAppState.TERMINATED,
        lastActiveAt: new Date(),
        deactivatedAt: new Date(),
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

  async findActiveFcmDevicesByUsers(userIds: string[]): Promise<UserDevice[]> {
    const uniqueUserIds = Array.from(new Set(userIds));

    if (uniqueUserIds.length === 0) {
      return [];
    }

    return this.userDeviceRepository
      .createQueryBuilder('device')
      .where('device.userId IN (:...userIds)', {
        userIds: uniqueUserIds,
      })
      .andWhere('device.isActive = :isActive', {
        isActive: true,
      })
      .andWhere('device.fcmToken IS NOT NULL')
      .andWhere("device.fcmToken <> ''")
      .orderBy('device.lastActiveAt', 'DESC')
      .getMany();
  }

  async findAllActiveFcmDevices(): Promise<UserDevice[]> {
    return this.userDeviceRepository
      .createQueryBuilder('device')
      .where('device.isActive = :isActive', {
        isActive: true,
      })
      .andWhere('device.fcmToken IS NOT NULL')
      .andWhere("device.fcmToken <> ''")
      .orderBy('device.lastActiveAt', 'DESC')
      .getMany();
  }

  async deactivateByFcmToken(fcmToken: string): Promise<void> {
    const normalizedToken = fcmToken.trim();

    if (!normalizedToken) {
      return;
    }

    const devices = await this.userDeviceRepository.find({
      where: {
        fcmToken: normalizedToken,
      },
    });

    if (devices.length === 0) {
      return;
    }

    for (const device of devices) {
      device.fcmToken = null;

      if (!device.voipToken) {
        device.isActive = false;
        device.appState = DeviceAppState.TERMINATED;
        device.deactivatedAt = new Date();
      }
    }

    await this.userDeviceRepository.save(devices);
  }

  private async deactivateOtherUsersForDevice(
    userId: string,
    deviceId: string,
  ): Promise<void> {
    const devices = await this.userDeviceRepository
      .createQueryBuilder('device')
      .where('device.deviceId = :deviceId', {
        deviceId,
      })
      .andWhere('device.userId <> :userId', {
        userId,
      })
      .getMany();

    if (devices.length === 0) {
      return;
    }

    for (const device of devices) {
      device.fcmToken = null;
      device.voipToken = null;
      device.isActive = false;
      device.appState = DeviceAppState.TERMINATED;
      device.lastActiveAt = new Date();
      device.deactivatedAt = new Date();
    }

    await this.userDeviceRepository.save(devices);
  }

  private async detachFcmTokenFromOtherDevices(params: {
    userId: string;
    deviceId: string;
    fcmToken: string;
  }): Promise<void> {
    const devices = await this.userDeviceRepository
      .createQueryBuilder('device')
      .where('device.fcmToken = :fcmToken', {
        fcmToken: params.fcmToken,
      })
      .andWhere(
        'NOT (device.userId = :userId AND device.deviceId = :deviceId)',
        {
          userId: params.userId,
          deviceId: params.deviceId,
        },
      )
      .getMany();

    if (devices.length === 0) {
      return;
    }

    for (const device of devices) {
      device.fcmToken = null;
      this.deactivateWhenNoTokensRemain(device);
    }

    await this.userDeviceRepository.save(devices);
  }

  private async detachVoipTokenFromOtherDevices(params: {
    userId: string;
    deviceId: string;
    voipToken: string;
  }): Promise<void> {
    const devices = await this.userDeviceRepository
      .createQueryBuilder('device')
      .where('device.voipToken = :voipToken', {
        voipToken: params.voipToken,
      })
      .andWhere(
        'NOT (device.userId = :userId AND device.deviceId = :deviceId)',
        {
          userId: params.userId,
          deviceId: params.deviceId,
        },
      )
      .getMany();

    if (devices.length === 0) {
      return;
    }

    for (const device of devices) {
      device.voipToken = null;
      this.deactivateWhenNoTokensRemain(device);
    }

    await this.userDeviceRepository.save(devices);
  }

  private deactivateWhenNoTokensRemain(device: UserDevice): void {
    if (device.fcmToken || device.voipToken) {
      return;
    }

    device.isActive = false;
    device.appState = DeviceAppState.TERMINATED;
    device.deactivatedAt = new Date();
  }
}
