import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  DeactivateDeviceTokenDto,
  RegisterDeviceTokenDto,
} from '../dto/device-token.dto';
import { DeviceToken } from '../entities/device-token.entity';

@Injectable()
export class DeviceTokensService {
  constructor(
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepository: Repository<DeviceToken>,
  ) {}

  async register(userId: string, dto: RegisterDeviceTokenDto) {
    let deviceToken = await this.deviceTokenRepository.findOne({
      where: { token: dto.token },
    });

    if (!deviceToken) {
      deviceToken = this.deviceTokenRepository.create({
        userId,
        token: dto.token,
        platform: dto.platform,
        deviceId: dto.deviceId ?? null,
        appVersion: dto.appVersion ?? null,
        timezone: dto.timezone ?? null,
        isActive: true,
        lastSeenAt: new Date(),
        deactivatedAt: null,
      });
    } else {
      deviceToken.userId = userId;
      deviceToken.platform = dto.platform;
      deviceToken.deviceId = dto.deviceId ?? deviceToken.deviceId;
      deviceToken.appVersion = dto.appVersion ?? deviceToken.appVersion;
      deviceToken.timezone = dto.timezone ?? deviceToken.timezone;
      deviceToken.isActive = true;
      deviceToken.lastSeenAt = new Date();
      deviceToken.deactivatedAt = null;
    }

    return this.deviceTokenRepository.save(deviceToken);
  }

  async deactivate(userId: string, dto: DeactivateDeviceTokenDto) {
    const deviceToken = await this.deviceTokenRepository.findOne({
      where: {
        userId,
        token: dto.token,
      },
    });

    if (!deviceToken) {
      throw new NotFoundException('Device token not found');
    }

    deviceToken.isActive = false;
    deviceToken.deactivatedAt = new Date();

    return this.deviceTokenRepository.save(deviceToken);
  }

  async deactivateByToken(token: string) {
    const deviceToken = await this.deviceTokenRepository.findOne({
      where: { token },
    });

    if (!deviceToken) {
      return null;
    }

    deviceToken.isActive = false;
    deviceToken.deactivatedAt = new Date();

    return this.deviceTokenRepository.save(deviceToken);
  }

  async findActiveTokensByUser(userId: string) {
    return this.deviceTokenRepository.find({
      where: {
        userId,
        isActive: true,
      },
      order: {
        lastSeenAt: 'DESC',
      },
    });
  }

  async findActiveTokensByUsers(userIds: string[]) {
    if (userIds.length === 0) {
      return [];
    }

    return this.deviceTokenRepository.find({
      where: {
        userId: In(userIds),
        isActive: true,
      },
      order: {
        lastSeenAt: 'DESC',
      },
    });
  }

  async findAllActiveTokens() {
    return this.deviceTokenRepository.find({
      where: {
        isActive: true,
      },
      order: {
        lastSeenAt: 'DESC',
      },
    });
  }
}
