import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DevicePlatform } from '../entities/device-token.entity';

export class RegisterDeviceTokenDto {
  @IsString()
  @MinLength(20)
  token: string;

  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;
}

export class DeactivateDeviceTokenDto {
  @IsString()
  @MinLength(20)
  token: string;
}
