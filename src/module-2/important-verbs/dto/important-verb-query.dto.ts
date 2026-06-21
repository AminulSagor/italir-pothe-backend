import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

import {
  ImportantVerbEndingType,
  ImportantVerbLanguage,
  ImportantVerbRegularity,
} from "../types/important-verb.type";

export class ImportantVerbListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ImportantVerbRegularity)
  regularity?: ImportantVerbRegularity;

  @IsOptional()
  @IsEnum(ImportantVerbEndingType)
  endingType?: ImportantVerbEndingType;

  @IsOptional()
  @IsEnum(ImportantVerbLanguage)
  language: ImportantVerbLanguage = ImportantVerbLanguage.ENGLISH;
}

export class ImportantVerbSearchQueryDto {
  @IsString()
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit = 10;

  @IsOptional()
  @IsEnum(ImportantVerbLanguage)
  language: ImportantVerbLanguage = ImportantVerbLanguage.ENGLISH;
}

export class ImportantVerbDetailQueryDto {
  @IsOptional()
  @IsEnum(ImportantVerbLanguage)
  language: ImportantVerbLanguage = ImportantVerbLanguage.ENGLISH;
}
