import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UserCareerTrackQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

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
}

export class UserSentenceQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

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
}

export class ReviewSkillBuilderSentenceDto {
  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;
}

export class RecordCareerTrackVideoProgressDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  watchedPercent: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  timeSpentSeconds?: number;

  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;
}

export class MarkCareerTrackTheoryOpenedDto {
  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;
}
