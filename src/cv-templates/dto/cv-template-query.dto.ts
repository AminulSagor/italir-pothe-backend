import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const transformNumber = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return Number(value);
};

const trimString = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue || undefined;
};

export class CvTemplateQueryDto {
  @Transform(transformNumber)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Transform(transformNumber)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
}
