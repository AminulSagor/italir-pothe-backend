import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import {
  AdminUserAccessFilter,
  AdminUserAccountStatusFilter,
  AdminUserCourseSortBy,
  AdminUserDirectorySortBy,
  AdminUserExamSortBy,
  AdminUserGrowthRange,
  AdminUserSortOrder,
} from '../types/admin-user-directory.type';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AdminUserDirectoryQueryDto {
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
  @IsEnum(AdminUserAccessFilter)
  accessTier?: AdminUserAccessFilter;

  @IsOptional()
  @IsEnum(AdminUserAccountStatusFilter)
  accountStatus?: AdminUserAccountStatusFilter;

  @IsOptional()
  @IsEnum(AdminUserDirectorySortBy)
  sortBy?: AdminUserDirectorySortBy;

  @IsOptional()
  @IsEnum(AdminUserSortOrder)
  sortOrder?: AdminUserSortOrder;
}

export class AdminUserGrowthQueryDto {
  @IsOptional()
  @IsEnum(AdminUserGrowthRange)
  range?: AdminUserGrowthRange;
}

export class AdminUserExamResultsQueryDto {
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
  @IsEnum(AdminUserExamSortBy)
  sortBy?: AdminUserExamSortBy;

  @IsOptional()
  @IsEnum(AdminUserSortOrder)
  sortOrder?: AdminUserSortOrder;
}

export class AdminUserCoursesQueryDto {
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
  @IsEnum(AdminUserCourseSortBy)
  sortBy?: AdminUserCourseSortBy;

  @IsOptional()
  @IsEnum(AdminUserSortOrder)
  sortOrder?: AdminUserSortOrder;
}

export class AdminUserActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  days?: number;
}

export class UpdateAdminUserRestrictionDto {
  @IsBoolean()
  isBanned: boolean;
}

export class QuickRestrictUserDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  identifier: string;
}
