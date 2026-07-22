import { Transform } from 'class-transformer';
import { Equals, IsString, Matches, MaxLength } from 'class-validator';

const accountIdentifierRegex =
  /^(?:[^\s@]+@[^\s@]+\.[^\s@]+|\+8801\d{9}|\+39\d{8,11})$/;

export class ConfirmAccountDeletionDto {
  @IsString()
  @MaxLength(320)
  @Matches(accountIdentifierRegex, {
    message:
      'Enter a valid registered email, Bangladesh phone number, or Italian phone number.',
  })
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const normalized = value.trim();

    return normalized.includes('@') ? normalized.toLowerCase() : normalized;
  })
  identifier: string;

  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'OTP must contain exactly 6 digits.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  otp: string;

  @IsString()
  @Equals('DELETE', {
    message: 'Type DELETE to confirm permanent account deletion.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  confirmation: string;
}
