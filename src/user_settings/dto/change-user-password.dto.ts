import { IsNotEmpty, IsString, Length } from 'class-validator';

export class ChangeUserPasswordDto {
  @IsNotEmpty()
  @IsString()
  currentPassword: string;

  @IsNotEmpty()
  @IsString()
  @Length(6, 6, {
    message: 'New password must be exactly 6 characters long',
  })
  newPassword: string;

  @IsNotEmpty()
  @IsString()
  @Length(6, 6, {
    message: 'Confirm password must be exactly 6 characters long',
  })
  confirmNewPassword: string;
}
