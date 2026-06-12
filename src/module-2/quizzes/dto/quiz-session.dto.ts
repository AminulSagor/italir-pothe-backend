import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class QuizMatchingAnswerDto {
  @IsUUID()
  pairId: string;

  @IsString()
  matchedText: string;
}

export class CheckQuizAnswerDto {
  @IsUUID()
  questionId: string;

  @IsOptional()
  @IsUUID()
  selectedOptionId?: string;

  @IsOptional()
  @IsString()
  writtenAnswer?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sequenceAnswerTexts?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizMatchingAnswerDto)
  matchingAnswers?: QuizMatchingAnswerDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  timeSpentSeconds?: number;
}

export class CompleteQuizSessionDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  totalTimeSeconds?: number;
}
