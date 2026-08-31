import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  AppUpdatePlatform,
  AppUpdateType,
} from '../entities/app-update-configuration.entity';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

const lower = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const semanticVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export class AppUpdatePlatformQueryDto {
  @Transform(lower)
  @IsEnum(AppUpdatePlatform)
  platform: AppUpdatePlatform;
}

export class UpdateAppUpdateConfigurationDto {
  @Transform(trim)
  @IsString()
  @Matches(semanticVersionPattern, {
    message: 'latestVersion must be a valid semantic version such as 1.10.0.',
  })
  @MaxLength(64)
  latestVersion: string;

  @Transform(trim)
  @IsString()
  @Matches(semanticVersionPattern, {
    message:
      'minimumSupportedVersion must be a valid semantic version such as 1.9.0.',
  })
  @MaxLength(64)
  minimumSupportedVersion: string;

  @IsEnum(AppUpdateType)
  updateType: AppUpdateType;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1200)
  message: string;

  @Transform(trim)
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(1000)
  storeUrl: string;

  @IsBoolean()
  enabled: boolean;
}
