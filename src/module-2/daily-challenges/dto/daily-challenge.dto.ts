import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import {
  DailyChallengeTaskKey,
  LearningActivityType,
} from '../types/daily-challenge.type';

export class DailyChallengeQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class RecordLearningActivityDto {
  @IsEnum(LearningActivityType)
  activityType: LearningActivityType;

  @IsOptional()
  @IsInt()
  @Min(1)
  value?: number;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ClaimDailyChallengeTaskDto {
  @IsEnum(DailyChallengeTaskKey)
  taskKey: DailyChallengeTaskKey;

  @IsOptional()
  @IsDateString()
  challengeDate?: string;
}

export class OpenDailyChestDto {
  @IsOptional()
  @IsDateString()
  challengeDate?: string;
}
