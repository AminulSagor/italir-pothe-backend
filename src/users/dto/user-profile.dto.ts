import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const strongPasswordRegex =
  /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]+$/;

const phoneRegex = /^(?:\+8801\d{9}|\+39\d{8,11})$/;

export class UpdateProfileNameDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName: string;
}

export class RequestEmailChangeOtpDto {
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;
}

export class VerifyEmailChangeOtpDto {
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'OTP must be exactly 4 digits' })
  otp: string;
}

export class RequestPhoneChangeOtpDto {
  @IsNotEmpty()
  @Matches(phoneRegex, {
    message:
      'Phone number must be a valid Bangladesh number like +8801XXXXXXXXX or Italy number like +39XXXXXXXXXX',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone: string;
}

export class VerifyPhoneChangeOtpDto {
  @IsNotEmpty()
  @Matches(phoneRegex, {
    message:
      'Phone number must be a valid Bangladesh number like +8801XXXXXXXXX or Italy number like +39XXXXXXXXXX',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'OTP must be exactly 4 digits' })
  otp: string;
}

export class UpdateProfilePhotoDto {
  @IsNotEmpty()
  @IsUUID()
  profilePhotoFileId: string;
}

export class UpdateUserPreferencesDto {
  @IsOptional()
  @IsBoolean()
  hapticsEnabled?: boolean;
}

export class ChangePasswordDto {
  @IsNotEmpty()
  @IsString()
  currentPassword: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @Matches(strongPasswordRegex, {
    message:
      'Password must contain at least one uppercase letter, one number, and one special character',
  })
  newPassword: string;

  @IsNotEmpty()
  @IsString()
  confirmNewPassword: string;
}
