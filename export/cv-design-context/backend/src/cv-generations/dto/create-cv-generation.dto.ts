import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { CvGenerationMode } from '../enums/cv-generation.enum';
import { CvDataDto } from './cv-data.dto';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCvGenerationDto {
  @IsEnum(CvGenerationMode)
  mode: CvGenerationMode;

  @ValidateIf((dto: CreateCvGenerationDto) => {
    return dto.mode === CvGenerationMode.TEMPLATE;
  })
  @IsUUID()
  templateId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  style?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  colorTheme?: string;

  /**
   * Flutter uploads the profile photo through the existing Files API,
   * then sends the returned file.id here.
   */
  @IsOptional()
  @IsUUID()
  profilePhotoFileId?: string;

  @ValidateNested()
  @Type(() => CvDataDto)
  cvData: CvDataDto;
}
