import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { DeviceAppState, DevicePlatform } from '../enums/device.enums';

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  deviceId: string;

  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  @IsOptional()
  @IsEnum(DeviceAppState)
  appState?: DeviceAppState;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  fcmToken?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  voipToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;
}

export class DeactivateDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  deviceId: string;
}
