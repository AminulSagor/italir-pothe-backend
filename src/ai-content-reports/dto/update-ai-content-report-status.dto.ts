import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { AiContentReportStatus } from '../entities/ai-content-report.entity';

const trimValue = ({ value }: TransformFnParams): unknown => {
  return typeof value === 'string' ? value.trim() : value;
};

export class UpdateAiContentReportStatusDto {
  @IsEnum(AiContentReportStatus)
  status: AiContentReportStatus;

  @Transform(trimValue)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}
