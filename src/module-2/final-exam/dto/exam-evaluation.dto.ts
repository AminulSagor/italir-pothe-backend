import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { ExamAttemptStatus, ExamVerdict } from '../types/final-exam.type';

export class EvaluationQueueQueryDto {
  @IsOptional()
  @IsEnum(ExamAttemptStatus)
  status?: ExamAttemptStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class GiveFinalVerdictDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  vocabularyUsageScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  grammarAccuracyScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  fluencyPronunciationScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  writingScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  speakingScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  finalAverageScore?: number;

  @IsString()
  teacherComment: string;

  @IsOptional()
  @IsString()
  teacherCommentBn?: string;

  @IsOptional()
  @IsString()
  keyStrength?: string;

  @IsOptional()
  @IsString()
  criticalGap?: string;

  @IsEnum(ExamVerdict)
  verdict: ExamVerdict;

  @IsOptional()
  @IsInt()
  @Min(0)
  evaluationDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  scoreReliabilityPercent?: number;

  @IsOptional()
  @IsBoolean()
  issueCertificate?: boolean;

  @IsOptional()
  @IsUUID()
  pdfFileId?: string;

  @IsOptional()
  @IsBoolean()
  notifyStudent?: boolean;
}

export class RequestRetakeDto {
  @IsOptional()
  @IsString()
  keyStrength?: string;

  @IsString()
  criticalGap: string;

  @IsString()
  teacherComment: string;

  @IsOptional()
  @IsString()
  teacherCommentBn?: string;

  @IsOptional()
  @IsBoolean()
  notifyStudent?: boolean;
}

export class IssueCertificateDto {
  @IsOptional()
  @IsUUID()
  pdfFileId?: string;

  @IsOptional()
  @IsBoolean()
  notifyStudent?: boolean;
}
