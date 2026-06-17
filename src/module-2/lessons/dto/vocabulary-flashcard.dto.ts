import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { VocabularyReviewMode } from '../entities/vocabulary-review-session.entity';

export class StartVocabularyReviewSessionDto {
  @IsOptional()
  @IsEnum(VocabularyReviewMode)
  mode?: VocabularyReviewMode;
}

export class CompleteVocabularyReviewDto {
  @IsArray()
  @IsUUID('4', { each: true })
  knownVocabularyIds: string[];

  @IsArray()
  @IsUUID('4', { each: true })
  weakVocabularyIds: string[];

  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;
}

export class CompleteWeakVocabularyReviewDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  knownVocabularyIds: string[];

  @IsArray()
  @IsUUID('4', { each: true })
  stillWeakVocabularyIds: string[];

  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;
}
