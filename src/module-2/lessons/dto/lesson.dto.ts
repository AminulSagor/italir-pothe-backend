import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLessonDto {
  @IsString()
  @MaxLength(180)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  slug?: string;

  @IsOptional()
  @IsUUID()
  videoFileId?: string;

  @IsOptional()
  @IsString()
  theoryText?: string;

  @IsOptional()
  @IsUUID()
  theoryAudioFileId?: string;

  @IsOptional()
  @IsString()
  bengaliTranslation?: string;

  @IsOptional()
  @IsUUID()
  supplementaryMaterialFileId?: string;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  slug?: string;

  @IsOptional()
  @IsUUID()
  videoFileId?: string;

  @IsOptional()
  @IsString()
  theoryText?: string | null;

  @IsOptional()
  @IsUUID()
  theoryAudioFileId?: string;

  @IsOptional()
  @IsString()
  bengaliTranslation?: string | null;

  @IsOptional()
  @IsUUID()
  supplementaryMaterialFileId?: string;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
