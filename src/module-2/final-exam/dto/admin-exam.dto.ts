import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { QuizQuestionFormat } from 'src/module-2/quizzes/types/quiz-question-format.type';
import {
  ExamAudioSourceType,
  ExamQuestionStatus,
  ExamTemplateStatus,
} from '../types/final-exam.type';
import { PartialType } from '@nestjs/mapped-types';

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};

export class ExamListQueryDto {
  @IsOptional()
  @IsEnum(ExamTemplateStatus)
  status?: ExamTemplateStatus;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  linkedOnly?: boolean;

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

export class CreateExamTemplateDto {
  @IsString()
  @MaxLength(180)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  overallPassingPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalDurationMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  unlockCompletionPercent?: number;

  @IsOptional()
  @IsBoolean()
  plagiarismMonitorEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  copyPasteMonitorEnabled?: boolean;

  @IsOptional()
  @IsString()
  resultNotice?: string;

  @IsOptional()
  @IsString()
  resultNoticeBn?: string;
}

export class LinkFinalExamWithCourseDto {
  @IsUUID()
  courseId: string;
}

export class UpdateExamTemplateDto {
  @IsOptional()
  @IsUUID()
  courseId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  overallPassingPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalDurationMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  unlockCompletionPercent?: number;

  @IsOptional()
  @IsBoolean()
  plagiarismMonitorEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  copyPasteMonitorEnabled?: boolean;

  @IsOptional()
  @IsString()
  resultNotice?: string | null;

  @IsOptional()
  @IsString()
  resultNoticeBn?: string | null;
}

export class FinalExamQuestionOptionDto {
  @IsString()
  @MaxLength(255)
  optionText: string;

  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class FinalExamMatchingPairDto {
  @IsString()
  @MaxLength(180)
  leftText: string;

  @IsString()
  @MaxLength(180)
  rightText: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  leftLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  rightLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class FinalExamSequenceItemDto {
  @IsString()
  @MaxLength(120)
  wordText: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class FinalExamAcceptedAnswerDto {
  @IsString()
  @MaxLength(180)
  answerText: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateCoreQuizQuestionDto {
  @IsEnum(QuizQuestionFormat)
  questionType: QuizQuestionFormat;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  promptText?: string;

  @IsOptional()
  @IsString()
  helperText?: string;

  @IsOptional()
  @IsString()
  translationText?: string;

  @IsOptional()
  @IsUUID()
  mediaFileId?: string;

  @IsOptional()
  @IsString()
  generatedAudioText?: string;

  @IsOptional()
  @IsBoolean()
  correctBoolean?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(ExamQuestionStatus)
  status?: ExamQuestionStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalExamQuestionOptionDto)
  options?: FinalExamQuestionOptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalExamMatchingPairDto)
  pairs?: FinalExamMatchingPairDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalExamSequenceItemDto)
  sequenceItems?: FinalExamSequenceItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalExamAcceptedAnswerDto)
  acceptedAnswers?: FinalExamAcceptedAnswerDto[];
}

export class UpdateCoreQuizQuestionDto {
  @IsOptional()
  @IsEnum(QuizQuestionFormat)
  questionType?: QuizQuestionFormat;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string | null;

  @IsOptional()
  @IsString()
  promptText?: string | null;

  @IsOptional()
  @IsString()
  helperText?: string | null;

  @IsOptional()
  @IsString()
  translationText?: string | null;

  @IsOptional()
  @IsUUID()
  mediaFileId?: string | null;

  @IsOptional()
  @IsString()
  generatedAudioText?: string | null;

  @IsOptional()
  @IsBoolean()
  correctBoolean?: boolean | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(ExamQuestionStatus)
  status?: ExamQuestionStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalExamQuestionOptionDto)
  options?: FinalExamQuestionOptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalExamMatchingPairDto)
  pairs?: FinalExamMatchingPairDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalExamSequenceItemDto)
  sequenceItems?: FinalExamSequenceItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalExamAcceptedAnswerDto)
  acceptedAnswers?: FinalExamAcceptedAnswerDto[];
}

export class CreateListeningMiniMcqQuestionDto {
  @IsString()
  @MaxLength(180)
  questionTitle: string;

  @IsOptional()
  @IsEnum(ExamAudioSourceType)
  audioSourceType?: ExamAudioSourceType;

  @IsOptional()
  @IsUUID()
  audioFileId?: string;

  @IsOptional()
  @IsString()
  generatedAudioText?: string;

  @IsString()
  questionPrompt: string;

  @IsOptional()
  @IsBoolean()
  lockPlayback?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalExamQuestionOptionDto)
  options: FinalExamQuestionOptionDto[];
}

export class UpsertWritingTaskDto {
  @IsString()
  @MaxLength(180)
  title: string;

  @IsString()
  @MaxLength(180)
  titleBn: string;

  @IsString()
  instruction: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minWords?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxWords?: number;

  @IsOptional()
  @IsBoolean()
  italianAccentBarEnabled?: boolean;
}

export class UpsertSpeakingTaskDto {
  @IsString()
  @MaxLength(180)
  title: string;

  @IsString()
  @MaxLength(180)
  titleBn: string;

  @IsString()
  instruction: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDurationSeconds?: number;

  @IsOptional()
  @IsBoolean()
  unlimitedRerecords?: boolean;
}

export class UpdateListeningMiniMcqQuestionDto extends PartialType(
  CreateListeningMiniMcqQuestionDto,
) {}
