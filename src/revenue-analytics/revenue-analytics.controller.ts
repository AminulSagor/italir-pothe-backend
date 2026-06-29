import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/users/entities/user.entity';

import {
  CoursePerformanceQueryDto,
  PackagePerformanceQueryDto,
  RevenueAnalyticsSearchQueryDto,
  RevenueDateRangeQueryDto,
  RevenueGrowthQueryDto,
  RevenueTransactionsQueryDto,
} from './dto/revenue-analytics-query.dto';
import { RevenueAnalyticsService } from './revenue-analytics.service';

@Controller('admin/revenue-analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class RevenueAnalyticsController {
  constructor(
    private readonly revenueAnalyticsService: RevenueAnalyticsService,
  ) {}

  @Get('overview')
  async getOverview(@Query() query: RevenueDateRangeQueryDto) {
    return this.revenueAnalyticsService.getOverview(query);
  }

  @Get('growth')
  async getGrowth(@Query() query: RevenueGrowthQueryDto) {
    return this.revenueAnalyticsService.getGrowth(query);
  }

  @Get('transactions')
  async getTransactions(@Query() query: RevenueTransactionsQueryDto) {
    return this.revenueAnalyticsService.getTransactions(query);
  }

  @Get('search')
  async searchAnalytics(@Query() query: RevenueAnalyticsSearchQueryDto) {
    return this.revenueAnalyticsService.searchAnalytics(query);
  }

  @Get('courses/overview')
  async getCourseOverview(@Query() query: RevenueDateRangeQueryDto) {
    return this.revenueAnalyticsService.getCourseOverview(query);
  }

  @Get('courses')
  async getCoursePerformance(@Query() query: CoursePerformanceQueryDto) {
    return this.revenueAnalyticsService.getCoursePerformance(query);
  }

  @Get('courses/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="course-performance.csv"',
  )
  async exportCourses(@Query() query: CoursePerformanceQueryDto) {
    return this.revenueAnalyticsService.exportCoursePerformanceCsv(query);
  }

  @Get('packages/overview')
  async getPackageOverview(@Query() query: RevenueDateRangeQueryDto) {
    return this.revenueAnalyticsService.getPackageOverview(query);
  }

  @Get('packages')
  async getPackagePerformance(@Query() query: PackagePerformanceQueryDto) {
    return this.revenueAnalyticsService.getPackagePerformance(query);
  }

  @Get('packages/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="package-performance.csv"',
  )
  async exportPackages(@Query() query: PackagePerformanceQueryDto) {
    return this.revenueAnalyticsService.exportPackagePerformanceCsv(query);
  }
}
