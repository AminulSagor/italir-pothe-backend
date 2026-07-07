import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { GooglePlayVoidedRecordStatus } from 'src/billing/types/google-play-reconciliation.type';
import {
  GooglePlayRtdnEventStatus,
  GooglePlayRtdnNotificationKind,
} from 'src/billing/types/google-play-rtdn.type';

const parseBoolean = ({ value }: { value: unknown }) => {
  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return value;
};

export class RunGooglePlayReconciliationDto {
  @IsOptional()
  @IsISO8601()
  startTime?: string;

  @IsOptional()
  @IsISO8601()
  endTime?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  maxPages?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(1000)
  processLimit?: number;
}

export class RetryGooglePlayFailuresDto {
  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  includeDeadLetter?: boolean;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}

export class QueryGooglePlayVoidedRecordsDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(GooglePlayVoidedRecordStatus)
  status?: GooglePlayVoidedRecordStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}

export class QueryGooglePlayRtdnEventsDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(GooglePlayRtdnEventStatus)
  status?: GooglePlayRtdnEventStatus;

  @IsOptional()
  @IsEnum(GooglePlayRtdnNotificationKind)
  kind?: GooglePlayRtdnNotificationKind;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
