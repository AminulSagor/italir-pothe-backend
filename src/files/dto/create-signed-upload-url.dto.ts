import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { FilePurpose, FileVisibility } from '../entities/file.entity';

export class CreateSignedUploadUrlDto {
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
}
