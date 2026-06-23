import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import {
  LeagueKey,
  LeaderboardRewardStatus,
  LeaderboardRewardType,
  LeaderboardSortOrder,
} from '../types/leaderboard.type';

export class AdminLeaderboardQueryDto {
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

  @IsOptional()
  @IsEnum(LeagueKey)
  league?: LeagueKey;

  @IsOptional()
  @IsIn(['rank', 'totalXp', 'displayName'])
  sortBy?: 'rank' | 'totalXp' | 'displayName';

  @IsOptional()
  @IsEnum(LeaderboardSortOrder)
  sortOrder?: LeaderboardSortOrder;
}

export class CreateLeaderboardRewardDto {
  @IsEnum(LeaderboardRewardType)
  rewardType: LeaderboardRewardType;

  @IsString()
  @MaxLength(180)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  rewardValue?: string;

  @ValidateIf(
    (dto: CreateLeaderboardRewardDto) =>
      dto.rewardType === LeaderboardRewardType.XP,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  xpAmount?: number;
}

export class RewardHistoryQueryDto {
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
  @IsEnum(LeaderboardRewardStatus)
  status?: LeaderboardRewardStatus;

  @IsOptional()
  @IsEnum(LeaderboardRewardType)
  rewardType?: LeaderboardRewardType;
}

export class UpdateRewardStatusDto {
  @IsEnum(LeaderboardRewardStatus)
  status: LeaderboardRewardStatus;
}
