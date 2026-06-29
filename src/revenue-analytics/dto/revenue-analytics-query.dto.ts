import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { CourseStatus } from 'src/module-2/courses/entities/course.entity';
import {
  StorePackageStatus,
  StorePackageType,
} from 'src/package-store/types/package-store.type';

import {
  CoursePerformanceSortBy,
  PackagePerformanceSortBy,
  RevenueDatePreset,
  RevenueGraphRange,
  RevenueSortOrder,
  RevenueSource,
  RevenueTransactionSortBy,
  RevenueTransactionStatus,
} from '../types/revenue-analytics.type';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RevenueDateRangeQueryDto {
  @IsOptional()
  @IsEnum(RevenueDatePreset)
  preset?: RevenueDatePreset;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class RevenueGrowthQueryDto {
  @IsOptional()
  @IsEnum(RevenueGraphRange)
  range?: RevenueGraphRange;
}

export class RevenueTransactionsQueryDto extends RevenueDateRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(180)
  search?: string;

  @IsOptional()
  @IsEnum(RevenueSource)
  source?: RevenueSource;

  @IsOptional()
  @IsEnum(RevenueTransactionStatus)
  status?: RevenueTransactionStatus;

  @IsOptional()
  @IsEnum(RevenueTransactionSortBy)
  sortBy?: RevenueTransactionSortBy;

  @IsOptional()
  @IsEnum(RevenueSortOrder)
  sortOrder?: RevenueSortOrder;
}

export class CoursePerformanceQueryDto extends RevenueDateRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(180)
  search?: string;

  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;

  @IsOptional()
  @IsEnum(CoursePerformanceSortBy)
  sortBy?: CoursePerformanceSortBy;

  @IsOptional()
  @IsEnum(RevenueSortOrder)
  sortOrder?: RevenueSortOrder;
}

export class PackagePerformanceQueryDto extends RevenueDateRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(180)
  search?: string;

  @IsOptional()
  @IsEnum(StorePackageType)
  packageType?: StorePackageType;

  @IsOptional()
  @IsEnum(StorePackageStatus)
  status?: StorePackageStatus;

  @IsOptional()
  @IsEnum(PackagePerformanceSortBy)
  sortBy?: PackagePerformanceSortBy;

  @IsOptional()
  @IsEnum(RevenueSortOrder)
  sortOrder?: RevenueSortOrder;
}

export class RevenueAnalyticsSearchQueryDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  search: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
