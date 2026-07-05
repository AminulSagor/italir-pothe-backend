import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

const strongPasswordRegex =
  /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]+$/;

export class ChangeUserPasswordDto {
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
