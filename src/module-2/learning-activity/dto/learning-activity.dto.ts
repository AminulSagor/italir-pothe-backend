import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { LearningTimeActivityType } from '../entities/user-learning-activity-time-entry.entity';

export class RecordLearningTimeDto {
  @IsUUID()
  eventId: string;

  @IsEnum(LearningTimeActivityType)
  activityType: LearningTimeActivityType;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  sourceId?: string;

  @IsInt()
  @Min(1)
  @Max(3600)
  durationSeconds: number;

  @IsDateString()
  startedAt: string;

  @IsDateString()
  endedAt: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  clientActivityDate?: string;
}

export class WeeklyLearningActivityQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  weekStart?: string;
}
