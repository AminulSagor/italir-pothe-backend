import {
  IsNotEmpty,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChangeUserPasswordDto {
  @IsNotEmpty()
  @IsString()
  currentPassword: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6, {
    message: 'Password must be at least 6 characters long',
  })
  @MaxLength(128, {
    message: 'Password must not exceed 128 characters',
  })
  newPassword: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6, {
    message: 'Password must be at least 6 characters long',
  })
  @MaxLength(128, {
    message: 'Password must not exceed 128 characters',
  })
  confirmNewPassword: string;
}
