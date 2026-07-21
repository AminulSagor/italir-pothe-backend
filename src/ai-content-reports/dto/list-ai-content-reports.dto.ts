import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  AiContentReportFeatureType,
  AiContentReportStatus,
} from '../entities/ai-content-report.entity';

export class ListAiContentReportsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsEnum(AiContentReportStatus)
  status?: AiContentReportStatus;

  @IsOptional()
  @IsEnum(AiContentReportFeatureType)
  featureType?: AiContentReportFeatureType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
