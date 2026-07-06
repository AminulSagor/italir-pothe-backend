import { Transform, Type } from 'class-transformer';

import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  GooglePlayDeveloperCancellationType,
  StoreSubscriptionStatus,
} from 'src/billing/types/google-play-subscription.type';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AdminStoreSubscriptionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(StoreSubscriptionStatus)
  status?: StoreSubscriptionStatus;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  search?: string;
}

export class CancelGooglePlaySubscriptionDto {
  @IsOptional()
  @IsEnum(GooglePlayDeveloperCancellationType)
  cancellationType?: GooglePlayDeveloperCancellationType;
}
