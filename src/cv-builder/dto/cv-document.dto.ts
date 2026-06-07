import { Transform } from 'class-transformer';
import {
  IsHexColor,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCvDocumentDto {
  @IsUUID()
  templateId: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(160)
  @Transform(trimString)
  title: string;

  @IsOptional()
  @IsHexColor()
  @Transform(trimString)
  themeColor?: string;

  @IsObject()
  formData: Record<string, unknown>;
}
