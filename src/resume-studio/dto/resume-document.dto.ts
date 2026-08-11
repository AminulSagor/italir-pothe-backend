import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ResumeTemplateQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class CreateResumeDocumentDto {
  @IsString()
  @Length(1, 160)
  title: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class AutosaveResumeDocumentDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  title?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision?: number;
}

export class RenderResumeDocumentDto {
  @IsOptional()
  @IsUUID()
  templateId?: string;
}

export class ResumeDocumentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
