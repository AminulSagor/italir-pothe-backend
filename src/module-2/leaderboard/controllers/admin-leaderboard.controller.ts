import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/users/entities/user.entity';
import { AdminLeaderboardQueryDto } from '../dto/admin-leaderboard.dto';
import { AdminLeaderboardService } from '../services/admin-leaderboard.service';

@Controller('admin/leaderboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminLeaderboardController {
  constructor(
    private readonly adminLeaderboardService: AdminLeaderboardService,
  ) {}

  @Get()
  async getDashboard(@Query() query: AdminLeaderboardQueryDto) {
    return this.adminLeaderboardService.getDashboard(query);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="leaderboard.csv"')
  async exportCsv(@Query() query: AdminLeaderboardQueryDto) {
    return this.adminLeaderboardService.exportCsv(query);
  }
}
