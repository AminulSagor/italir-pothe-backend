import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { QuizStatus } from '../entities/quiz.entity';
import { QuizQuestionStatus } from '../entities/quiz-question.entity';
import { QuizQuestionFormat } from '../types/quiz-question-format.type';

export class CreateQuizDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(QuizStatus)
  status?: QuizStatus;
}

export class UpdateQuizDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(QuizStatus)
  status?: QuizStatus;
}

export class QuizQuestionOptionDto {
  @IsString()
  @MaxLength(255)
  optionText: string;

  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class QuizMatchingPairDto {
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
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class QuizSequenceItemDto {
  @IsString()
  @MaxLength(120)
  wordText: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class QuizAcceptedAnswerDto {
  @IsString()
  @MaxLength(180)
  answerText: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateQuizQuestionDto {
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
  @IsInt()
  @Min(1)
  points?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(QuizQuestionStatus)
  status?: QuizQuestionStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionOptionDto)
  options?: QuizQuestionOptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizMatchingPairDto)
  pairs?: QuizMatchingPairDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizSequenceItemDto)
  sequenceItems?: QuizSequenceItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizAcceptedAnswerDto)
  acceptedAnswers?: QuizAcceptedAnswerDto[];
}

export class UpdateQuizQuestionDto {
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
  correctBoolean?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  points?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(QuizQuestionStatus)
  status?: QuizQuestionStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionOptionDto)
  options?: QuizQuestionOptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizMatchingPairDto)
  pairs?: QuizMatchingPairDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizSequenceItemDto)
  sequenceItems?: QuizSequenceItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizAcceptedAnswerDto)
  acceptedAnswers?: QuizAcceptedAnswerDto[];
}
