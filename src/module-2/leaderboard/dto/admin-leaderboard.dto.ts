import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
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

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(180)
  title: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(300)
  subtitle?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1500)
  congratulatoryNote?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1500)
  earnedReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  fileUrl?: string;

  @IsOptional()
  @IsUUID()
  relatedResourceId?: string;

  @ValidateIf((dto: CreateLeaderboardRewardDto) =>
    [
      LeaderboardRewardType.XP,
      LeaderboardRewardType.STREAK_FREEZE,
      LeaderboardRewardType.CV_CREDITS,
      LeaderboardRewardType.AI_PACKAGE,
    ].includes(dto.rewardType),
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  primaryAmount?: number;

  @ValidateIf(
    (dto: CreateLeaderboardRewardDto) =>
      dto.rewardType === LeaderboardRewardType.AI_PACKAGE,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  secondaryAmount?: number;

  @IsOptional()
  @IsBoolean()
  sendPushNotification?: boolean;

  @IsOptional()
  @IsBoolean()
  playConfettiAnimation?: boolean;

  @IsOptional()
  @IsBoolean()
  requestShippingAddress?: boolean;
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
  @IsEnum(LeagueKey)
  league?: LeagueKey;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsIn(['createdAt', 'title', 'status', 'rewardType', 'recipient'])
  sortBy?: 'createdAt' | 'title' | 'status' | 'rewardType' | 'recipient';

  @IsOptional()
  @IsEnum(LeaderboardSortOrder)
  sortOrder?: LeaderboardSortOrder;
}

export class UpdateRewardStatusDto {
  @IsEnum(LeaderboardRewardStatus)
  status: LeaderboardRewardStatus;
}

export class DispatchLeaderboardRewardDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(160)
  carrierName?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  invoiceUrl?: string;

  @IsOptional()
  @IsBoolean()
  sendNotification?: boolean;
}

export class SendRewardUpdateDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  body?: string;
}
