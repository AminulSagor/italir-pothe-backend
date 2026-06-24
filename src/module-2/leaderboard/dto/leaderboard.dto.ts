import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  LeaderboardRewardStatus,
  LeaderboardRewardType,
  LeaderboardScope,
  LeaderboardSortOrder,
} from '../types/leaderboard.type';

export class LeaderboardQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEnum(LeaderboardScope)
  scope?: LeaderboardScope;

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
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(160)
  search?: string;
}

export class UserRewardHistoryQueryDto {
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
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(180)
  search?: string;

  @IsOptional()
  @IsEnum(LeaderboardRewardStatus)
  status?: LeaderboardRewardStatus;

  @IsOptional()
  @IsEnum(LeaderboardRewardType)
  rewardType?: LeaderboardRewardType;

  @IsOptional()
  @IsIn(['createdAt', 'title', 'status', 'rewardType'])
  sortBy?: 'createdAt' | 'title' | 'status' | 'rewardType';

  @IsOptional()
  @IsEnum(LeaderboardSortOrder)
  sortOrder?: LeaderboardSortOrder;
}

export class RewardShippingAddressDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(180)
  fullName: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(50)
  whatsappNumber: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1200)
  addressLine: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(2)
  countryCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({
    maxDecimalPlaces: 7,
  })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({
    maxDecimalPlaces: 7,
  })
  @Min(-180)
  @Max(180)
  longitude?: number;
}
