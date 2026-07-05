import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  DashboardOrderSortBy,
  DashboardOrderSource,
  DashboardOrderStatus,
  DashboardRevenueRange,
  DashboardSortOrder,
} from '../types/admin-dashboard.type';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class DashboardRevenueGrowthQueryDto {
  @IsOptional()
  @IsEnum(DashboardRevenueRange)
  range?: DashboardRevenueRange;
}

export class DashboardOrdersFilterDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(180)
  search?: string;

  @IsOptional()
  @IsEnum(DashboardOrderStatus)
  status?: DashboardOrderStatus;

  @IsOptional()
  @IsEnum(DashboardOrderSource)
  source?: DashboardOrderSource;

  @IsOptional()
  @IsEnum(DashboardOrderSortBy)
  sortBy?: DashboardOrderSortBy;

  @IsOptional()
  @IsEnum(DashboardSortOrder)
  sortOrder?: DashboardSortOrder;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class DashboardOrdersQueryDto extends DashboardOrdersFilterDto {
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
}

export class DashboardOrdersExportQueryDto extends DashboardOrdersFilterDto {}
