import {
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { HomeDashboardQueryDto } from '../dto/home-dashboard-query.dto';
import { HomeDashboardService } from '../services/home-dashboard.service';

@Controller('home')
@UseGuards(JwtAuthGuard)
export class HomeDashboardController {
  constructor(private readonly homeDashboardService: HomeDashboardService) {}

  @Get('dashboard')
  getDashboard(
    @Query() query: HomeDashboardQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.id ?? request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return this.homeDashboardService.getDashboard(userId, query.weekStart);
  }
}
