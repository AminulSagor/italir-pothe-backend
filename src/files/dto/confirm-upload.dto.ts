import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { FilePurpose, FileVisibility } from '../entities/file.entity';
import { MediaType } from '../entities/media-asset.entity';

export class ConfirmUploadDto {
  @IsNotEmpty()
  @IsString()
  storageKey: string;

  @IsNotEmpty()
  @IsString()
  originalName: string;

  @IsNotEmpty()
  @IsString()
  mimeType: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300 * 1024 * 1024)
  sizeBytes: number;

  @IsNotEmpty()
  @IsIn(Object.values(FilePurpose))
  filePurpose: FilePurpose;

  @IsOptional()
  @IsIn(Object.values(FileVisibility))
  visibility?: FileVisibility;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(Object.values(MediaType))
  mediaType?: MediaType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsUUID()
  thumbnailFileId?: string;
}
