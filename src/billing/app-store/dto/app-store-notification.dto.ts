import { Transform } from 'class-transformer';

import { IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AppStoreServerNotificationDto {
  @Transform(trim)
  @IsString()
  @MaxLength(100000)
  signedPayload: string;
}
