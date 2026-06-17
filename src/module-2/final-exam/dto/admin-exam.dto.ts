import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { QuizQuestionFormat } from 'src/module-2/quizzes/types/quiz-question-format.type';
import {
  ExamAudioSourceType,
  ExamQuestionStatus,
  ExamReviewMode,
  ExamRetakePolicy,
  ExamSectionStatus,
  ExamSectionType,
  ExamTemplateStatus,
} from '../types/final-exam.type';

export class CreateExamTemplateDto {
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  overallPassingPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalDurationMinutes?: number;

  @IsOptional()
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

  @IsOptional()
  @IsEnum(ExamTemplateStatus)
  status?: ExamTemplateStatus;
}

export class UpdateExamTemplateDto {
  @IsOptional()
  @IsUUID()
  courseId?: string | null;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  overallPassingPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalDurationMinutes?: number;

  @IsOptional()
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

  @IsOptional()
  @IsEnum(ExamTemplateStatus)
  status?: ExamTemplateStatus;
}

export class UpsertExamSectionRuleDto {
  @IsOptional()
  @IsBoolean()
  playbackLocked?: boolean;

  @IsOptional()
  @IsBoolean()
  accentBarEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minWords?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxWords?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDurationSeconds?: number | null;

  @IsOptional()
  @IsEnum(ExamRetakePolicy)
  rerecordPolicy?: ExamRetakePolicy;
}

export class CreateExamSectionDto {
  @IsEnum(ExamSectionType)
  sectionType: ExamSectionType;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsEnum(ExamReviewMode)
  reviewMode: ExamReviewMode;

  @IsOptional()
  @IsInt()
  @Min(0)
  questionCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  passingPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  timeLimitSeconds?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(ExamSectionStatus)
  status?: ExamSectionStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertExamSectionRuleDto)
  rule?: UpsertExamSectionRuleDto;
}

export class UpdateExamSectionDto {
  @IsOptional()
  @IsEnum(ExamSectionType)
  sectionType?: ExamSectionType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  subtitle?: string | null;

  @IsOptional()
  @IsEnum(ExamReviewMode)
  reviewMode?: ExamReviewMode;

  @IsOptional()
  @IsInt()
  @Min(0)
  questionCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  passingPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  timeLimitSeconds?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(ExamSectionStatus)
  status?: ExamSectionStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertExamSectionRuleDto)
  rule?: UpsertExamSectionRuleDto;
}

export class ExamQuestionOptionDto {
  @IsString()
  optionText: string;

  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class ExamMatchingPairDto {
  @IsString()
  leftText: string;

  @IsString()
  rightText: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class ExamSequenceItemDto {
  @IsString()
  itemText: string;

  @IsOptional()
  @IsBoolean()
  isDecoy?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  correctOrder?: number;
}

export class ExamAcceptedAnswerDto {
  @IsString()
  answerText: string;

  @IsOptional()
  @IsBoolean()
  ignoreCase?: boolean;

  @IsOptional()
  @IsBoolean()
  ignorePunctuation?: boolean;
}

export class CreateExamQuestionDto {
  @IsEnum(QuizQuestionFormat)
  questionFormat: QuizQuestionFormat;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  promptBn?: string;

  @IsOptional()
  @IsUUID()
  audioFileId?: string;

  @IsOptional()
  @IsUUID()
  imageFileId?: string;

  @IsOptional()
  @IsBoolean()
  correctBoolean?: boolean;

  @IsOptional()
  @IsEnum(ExamAudioSourceType)
  audioSourceType?: ExamAudioSourceType;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(ExamQuestionStatus)
  status?: ExamQuestionStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamQuestionOptionDto)
  options?: ExamQuestionOptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamMatchingPairDto)
  pairs?: ExamMatchingPairDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamSequenceItemDto)
  sequenceItems?: ExamSequenceItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamAcceptedAnswerDto)
  acceptedAnswers?: ExamAcceptedAnswerDto[];
}

export class UpdateExamQuestionDto {
  @IsOptional()
  @IsEnum(QuizQuestionFormat)
  questionFormat?: QuizQuestionFormat;

  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsString()
  subtitle?: string | null;

  @IsOptional()
  @IsString()
  prompt?: string | null;

  @IsOptional()
  @IsString()
  promptBn?: string | null;

  @IsOptional()
  @IsUUID()
  audioFileId?: string | null;

  @IsOptional()
  @IsUUID()
  imageFileId?: string | null;

  @IsOptional()
  @IsBoolean()
  correctBoolean?: boolean | null;

  @IsOptional()
  @IsEnum(ExamAudioSourceType)
  audioSourceType?: ExamAudioSourceType;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(ExamQuestionStatus)
  status?: ExamQuestionStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamQuestionOptionDto)
  options?: ExamQuestionOptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamMatchingPairDto)
  pairs?: ExamMatchingPairDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamSequenceItemDto)
  sequenceItems?: ExamSequenceItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamAcceptedAnswerDto)
  acceptedAnswers?: ExamAcceptedAnswerDto[];
}

export class ExamListQueryDto {
  @IsOptional()
  @IsEnum(ExamTemplateStatus)
  status?: ExamTemplateStatus;

  @IsOptional()
  @IsUUID()
  courseId?: string;
}

export class UpdateManualScoreDto {
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
}
