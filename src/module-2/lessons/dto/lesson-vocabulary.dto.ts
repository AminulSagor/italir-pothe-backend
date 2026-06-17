import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLessonVocabularyDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(180)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  italianWord: string;

  @IsOptional()
  @IsUUID()
  aiPronunciationFileId?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  englishMeaning: string;

  @IsOptional()
  @IsString()
  @MaxLength(700)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  englishExample?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateLessonVocabularyDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  italianWord?: string;

  @IsOptional()
  @IsUUID()
  aiPronunciationFileId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  englishMeaning?: string;

  @IsOptional()
  @IsString()
  @MaxLength(700)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  englishExample?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class LessonVocabularyQueryDto {
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
  limit?: number;
}
