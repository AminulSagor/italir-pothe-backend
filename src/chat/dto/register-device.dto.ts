import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { DeviceAppState, DevicePlatform } from '../enums/chat.enums';

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
  @MaxLength(512)
  fcmToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  voipToken?: string;
}
