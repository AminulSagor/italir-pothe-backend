import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { DevicePlatform } from '../../devices/enums/device.enums';

const strongPasswordRegex =
  /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]+$/;

const phoneRegex = /^(?:\+8801\d{9}|\+39\d{8,11})$/;

export class SignupDto {
  @IsNotEmpty({
    message: 'Full name is required',
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName: string;

  @IsOptional()
  @IsEmail(
    {},
    {
      message: 'Please provide a valid email address',
    },
  )
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email?: string;

  @IsOptional()
  @Matches(phoneRegex, {
    message:
      'Phone number must be a valid Bangladesh number like +8801XXXXXXXXX or Italy number like +39XXXXXXXXXX',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone?: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8, {
    message: 'Password must be at least 8 characters long',
  })
  @Matches(strongPasswordRegex, {
    message:
      'Password must contain at least one uppercase letter, one number, and one special character',
  })
  password: string;
}

export class CreateAdminDto extends SignupDto {}

export class LoginDto {
  @IsNotEmpty({
    message: 'Please provide your email or phone number',
  })
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  identifier: string;

  @IsNotEmpty()
  @IsString()
  password: string;

  /*
   * Stable unique ID for this app installation.
   *
   * Optional temporarily so older app versions do not break
   * while the updated Flutter application is being released.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  deviceId?: string;

  /*
   * Supported values:
   * android, ios, web, desktop
   */
  @IsOptional()
  @IsEnum(DevicePlatform)
  platform?: DevicePlatform;
}

export class VerifyOtpDto {
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  identifier: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'OTP must be exactly 4 digits',
  })
  otp: string;

  /*
   * The device where OTP verification was completed.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  deviceId?: string;

  @IsOptional()
  @IsEnum(DevicePlatform)
  platform?: DevicePlatform;
}

export class ResendOtpDto {
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  identifier: string;
}

export class ForgotPasswordDto {
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  identifier: string;
}

export class VerifyPasswordResetOtpDto {
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  identifier: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'OTP must be exactly 4 digits',
  })
  otp: string;
}

export class ResetPasswordDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, {
    message: 'Password reset session is invalid or expired',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  resetToken: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8, {
    message: 'Password must be at least 8 characters long',
  })
  @Matches(strongPasswordRegex, {
    message:
      'Password must contain at least one uppercase letter, one number, and one special character',
  })
  newPassword: string;
}
