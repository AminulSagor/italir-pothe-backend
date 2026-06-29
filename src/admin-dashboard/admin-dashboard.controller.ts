import {
  Controller,
  Get,
  Header,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/users/entities/user.entity';

import { AdminDashboardService } from './admin-dashboard.service';
import {
  DashboardOrdersExportQueryDto,
  DashboardOrdersQueryDto,
  DashboardRevenueGrowthQueryDto,
} from './dto/admin-dashboard.dto';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get('overview')
  async getOverview() {
    return this.adminDashboardService.getOverview();
  }

  @Get('revenue-growth')
  async getRevenueGrowth(@Query() query: DashboardRevenueGrowthQueryDto) {
    return this.adminDashboardService.getRevenueGrowth(query);
  }

  @Get('recent-purchases')
  async getRecentPurchases() {
    return this.adminDashboardService.getRecentPurchases();
  }

  @Get('orders')
  async getOrders(@Query() query: DashboardOrdersQueryDto) {
    return this.adminDashboardService.getOrders(query);
  }

  @Get('orders/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="dashboard-orders.csv"')
  async exportOrders(
    @Query() query: DashboardOrdersExportQueryDto,
  ): Promise<StreamableFile> {
    const csv = await this.adminDashboardService.exportOrdersCsv(query);

    return new StreamableFile(Buffer.from(csv, 'utf8'));
  }
}
