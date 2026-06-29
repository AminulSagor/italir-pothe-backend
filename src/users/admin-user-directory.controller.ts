import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

import {
  AdminUserActivityQueryDto,
  AdminUserCoursesQueryDto,
  AdminUserDirectoryQueryDto,
  AdminUserExamResultsQueryDto,
  AdminUserGrowthQueryDto,
  QuickRestrictUserDto,
  UpdateAdminUserRestrictionDto,
} from './dto/admin-user-directory.dto';
import { UserRole } from './entities/user.entity';
import { AdminUserDirectoryService } from './admin-user-directory.service';
import type {
  AdminUserActivityAnalyticsResponse,
  AdminUserCoursesResponse,
  AdminUserDashboardResponse,
  AdminUserDetailsResponse,
  AdminUserDirectoryResponse,
  AdminUserExamResultsResponse,
  AdminUserGrowthResponse,
} from './types/admin-user-directory.type';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminUserDirectoryController {
  constructor(
    private readonly adminUserDirectoryService: AdminUserDirectoryService,
  ) {}

  @Get('dashboard')
  async getDashboard(): Promise<AdminUserDashboardResponse> {
    return this.adminUserDirectoryService.getDashboard();
  }

  @Get('growth')
  async getGrowth(
    @Query() query: AdminUserGrowthQueryDto,
  ): Promise<AdminUserGrowthResponse> {
    return this.adminUserDirectoryService.getGrowth(query);
  }

  @Post('quick-ban')
  async quickBan(
    @Body() dto: QuickRestrictUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminUserDirectoryService.quickRestrict(
      this.getAdminId(request),
      dto,
    );
  }

  @Get()
  async findUsers(
    @Query() query: AdminUserDirectoryQueryDto,
  ): Promise<AdminUserDirectoryResponse> {
    return this.adminUserDirectoryService.findUsers(query);
  }

  @Get(':userId/exam-results')
  async getExamResults(
    @Param(
      'userId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    userId: string,
    @Query() query: AdminUserExamResultsQueryDto,
  ): Promise<AdminUserExamResultsResponse> {
    return this.adminUserDirectoryService.getUserExamResults(userId, query);
  }

  @Get(':userId/courses')
  async getCourses(
    @Param(
      'userId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    userId: string,
    @Query() query: AdminUserCoursesQueryDto,
  ): Promise<AdminUserCoursesResponse> {
    return this.adminUserDirectoryService.getUserCourses(userId, query);
  }

  @Get(':userId/activity')
  async getActivityAnalytics(
    @Param(
      'userId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    userId: string,
    @Query() query: AdminUserActivityQueryDto,
  ): Promise<AdminUserActivityAnalyticsResponse> {
    return this.adminUserDirectoryService.getUserActivityAnalytics(
      userId,
      query,
    );
  }

  @Patch(':userId/restriction')
  async updateRestriction(
    @Param(
      'userId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    userId: string,
    @Body() dto: UpdateAdminUserRestrictionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminUserDirectoryService.updateRestriction({
      adminUserId: this.getAdminId(request),
      userId,
      dto,
    });
  }

  @Get(':userId')
  async getUserDetails(
    @Param(
      'userId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    userId: string,
  ): Promise<AdminUserDetailsResponse> {
    return this.adminUserDirectoryService.getUserDetails(userId);
  }

  private getAdminId(request: AuthenticatedRequest): string {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated admin user not found.');
    }

    return id;
  }
}
