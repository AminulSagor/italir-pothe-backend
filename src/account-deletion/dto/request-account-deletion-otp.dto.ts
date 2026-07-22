import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const accountIdentifierRegex =
  /^(?:[^\s@]+@[^\s@]+\.[^\s@]+|\+8801\d{9}|\+39\d{8,11})$/;

export class RequestAccountDeletionOtpDto {
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

  /*
   * Hidden honeypot field used by the website.
   * Real users should always submit an empty value.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
