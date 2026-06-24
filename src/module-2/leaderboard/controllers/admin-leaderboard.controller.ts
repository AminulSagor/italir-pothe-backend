import {
  Body,
  Controller,
  Get,
  Header,
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
import { UserRole } from 'src/users/entities/user.entity';
import {
  AdminLeaderboardQueryDto,
  CreateLeaderboardRewardDto,
  RewardHistoryQueryDto,
  UpdateRewardStatusDto,
} from '../dto/admin-leaderboard.dto';
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

  @Post('users/:userId/rewards')
  async createReward(
    @Param('userId', new ParseUUIDPipe({ version: '4' }))
    userId: string,
    @Body() dto: CreateLeaderboardRewardDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminLeaderboardService.createReward({
      adminUserId: this.getUserId(request),
      userId,
      dto,
    });
  }

  @Get('rewards')
  async findRewardHistory(@Query() query: RewardHistoryQueryDto) {
    return this.adminLeaderboardService.findRewardHistory(query);
  }

  @Patch('rewards/:rewardId/status')
  async updateRewardStatus(
    @Param('rewardId', new ParseUUIDPipe({ version: '4' }))
    rewardId: string,
    @Body() dto: UpdateRewardStatusDto,
  ) {
    return this.adminLeaderboardService.updateRewardStatus(rewardId, dto);
  }

  private getUserId(request: AuthenticatedRequest): string {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated admin user not found.');
    }

    return id;
  }
}
