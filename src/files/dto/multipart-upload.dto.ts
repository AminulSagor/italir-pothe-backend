import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { FilePurpose, FileVisibility } from '../entities/file.entity';

export class InitiateMultipartUploadDto {
  @IsString()
  @IsNotEmpty()
  originalName: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes: number;

  @IsIn(Object.values(FilePurpose))
  filePurpose: FilePurpose;

  @IsOptional()
  @IsIn(Object.values(FileVisibility))
  visibility?: FileVisibility;
}

export class SignMultipartPartsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(10000, { each: true })
  partNumbers: number[];
}

export class CompletedMultipartPartDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  partNumber: number;

  @IsString()
  @IsNotEmpty()
  eTag: string;
}

export class CompleteMultipartUploadDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CompletedMultipartPartDto)
  parts: CompletedMultipartPartDto[];

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsUUID()
  thumbnailFileId?: string;
}
