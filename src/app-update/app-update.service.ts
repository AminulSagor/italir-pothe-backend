import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UpdateAppUpdateConfigurationDto } from './dto/app-update.dto';
import {
  AppUpdateConfiguration,
  AppUpdatePlatform,
  AppUpdateType,
} from './entities/app-update-configuration.entity';

interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

@Injectable()
export class AppUpdateService {
  constructor(
    @InjectRepository(AppUpdateConfiguration)
    private readonly configurationRepository: Repository<AppUpdateConfiguration>,
  ) {}

  async getPublicConfiguration(platform: AppUpdatePlatform) {
    const configuration = await this.configurationRepository.findOneBy({
      platform,
    });

    if (configuration) {
      return configuration;
    }

    return {
      platform,
      latestVersion: '0.0.0',
      minimumSupportedVersion: '0.0.0',
      updateType: AppUpdateType.DISABLED,
      title: '',
      message: '',
      storeUrl: '',
      enabled: false,
      updatedAt: null,
    };
  }

  async getAdminConfigurations(): Promise<AppUpdateConfiguration[]> {
    return this.configurationRepository.find({
      order: { platform: 'ASC' },
    });
  }

  async updateConfiguration(
    platform: AppUpdatePlatform,
    dto: UpdateAppUpdateConfigurationDto,
  ): Promise<AppUpdateConfiguration> {
    if (
      this.compareVersions(dto.minimumSupportedVersion, dto.latestVersion) > 0
    ) {
      throw new BadRequestException(
        'Minimum supported version cannot be newer than latest version.',
      );
    }

    this.assertOfficialStoreUrl(platform, dto.storeUrl);

    const existing = await this.configurationRepository.findOneBy({
      platform,
    });

    const configuration = this.configurationRepository.create({
      ...existing,
      ...dto,
      platform,
    });

    return this.configurationRepository.save(configuration);
  }

  private assertOfficialStoreUrl(
    platform: AppUpdatePlatform,
    storeUrl: string,
  ): void {
    let url: URL;

    try {
      url = new URL(storeUrl);
    } catch {
      throw new BadRequestException('Store URL is invalid.');
    }

    if (url.protocol !== 'https:') {
      throw new BadRequestException('Store URL must use HTTPS.');
    }

    if (
      platform === AppUpdatePlatform.ANDROID &&
      (url.hostname !== 'play.google.com' ||
        !url.pathname.startsWith('/store/apps/details'))
    ) {
      throw new BadRequestException(
        'Android Store URL must point to the official Google Play listing.',
      );
    }

    if (
      platform === AppUpdatePlatform.IOS &&
      (url.hostname !== 'apps.apple.com' || !url.pathname.includes('/app/'))
    ) {
      throw new BadRequestException(
        'iOS Store URL must point to the official Apple App Store listing.',
      );
    }
  }

  private compareVersions(left: string, right: string): number {
    const leftVersion = this.parseSemanticVersion(left);
    const rightVersion = this.parseSemanticVersion(right);

    for (const key of ['major', 'minor', 'patch'] as const) {
      const difference = leftVersion[key] - rightVersion[key];
      if (difference !== 0) {
        return difference > 0 ? 1 : -1;
      }
    }

    return this.comparePrerelease(
      leftVersion.prerelease,
      rightVersion.prerelease,
    );
  }

  private parseSemanticVersion(value: string): SemanticVersion {
    const withoutBuildMetadata = value.split('+', 1)[0];
    const separatorIndex = withoutBuildMetadata.indexOf('-');
    const core =
      separatorIndex < 0
        ? withoutBuildMetadata
        : withoutBuildMetadata.slice(0, separatorIndex);
    const prerelease =
      separatorIndex < 0 ? '' : withoutBuildMetadata.slice(separatorIndex + 1);
    const [major, minor, patch] = core.split('.').map(Number);

    return {
      major,
      minor,
      patch,
      prerelease: prerelease ? prerelease.split('.') : [],
    };
  }

  private comparePrerelease(left: string[], right: string[]): number {
    if (left.length === 0 || right.length === 0) {
      if (left.length === right.length) return 0;
      return left.length === 0 ? 1 : -1;
    }

    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const leftPart = left[index];
      const rightPart = right[index];

      if (leftPart === undefined || rightPart === undefined) {
        if (leftPart === rightPart) return 0;
        return leftPart === undefined ? -1 : 1;
      }

      if (leftPart === rightPart) continue;

      const leftNumeric = /^\d+$/.test(leftPart);
      const rightNumeric = /^\d+$/.test(rightPart);

      if (leftNumeric && rightNumeric) {
        return BigInt(leftPart) > BigInt(rightPart) ? 1 : -1;
      }

      if (leftNumeric !== rightNumeric) {
        return leftNumeric ? -1 : 1;
      }

      return leftPart > rightPart ? 1 : -1;
    }

    return 0;
  }
}
