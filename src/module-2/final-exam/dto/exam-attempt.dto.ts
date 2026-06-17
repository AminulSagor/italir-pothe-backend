import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { ExamAnswerType } from '../types/final-exam.type';

export class StartExamAttemptDto {
  @IsUUID()
  courseId: string;
}

export class ExamAnswerItemDto {
  @IsOptional()
  @IsUUID()
  selectedItemId?: string | null;

  @IsOptional()
  @IsUUID()
  matchedWithItemId?: string | null;

  @IsOptional()
  @IsString()
  textValue?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class SubmitExamAnswerDto {
  @IsUUID()
  sectionId: string;

  @IsUUID()
  questionId: string;

  @IsEnum(ExamAnswerType)
  answerType: ExamAnswerType;

  @IsOptional()
  @IsUUID()
  selectedOptionId?: string | null;

  @IsOptional()
  @IsString()
  textAnswer?: string | null;

  @IsOptional()
  @IsUUID()
  audioFileId?: string | null;

  @IsOptional()
  @IsBoolean()
  booleanAnswer?: boolean | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamAnswerItemDto)
  items?: ExamAnswerItemDto[];
}

export class SubmitExamAttemptDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  totalDurationSeconds?: number;

  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;
}
