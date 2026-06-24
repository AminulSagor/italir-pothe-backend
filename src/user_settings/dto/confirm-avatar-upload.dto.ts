import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
} from 'class-validator';

const avatarMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;

export class ConfirmAvatarUploadDto {
  @IsNotEmpty()
  @IsString()
  storageKey: string;

  @IsNotEmpty()
  @IsString()
  originalName: string;

  @IsNotEmpty()
  @IsIn(avatarMimeTypes)
  mimeType: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024)
  sizeBytes: number;
}
