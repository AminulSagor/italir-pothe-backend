import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
  CreateLeaderboardRewardDto,
  DispatchLeaderboardRewardDto,
  RewardHistoryQueryDto,
  SendRewardUpdateDto,
  UpdateRewardStatusDto,
} from '../dto/admin-leaderboard.dto';
import { RewardShippingAddressDto } from '../dto/leaderboard.dto';
import { AdminLeaderboardRewardService } from '../services/admin-leaderboard-reward.service';

@Controller('admin/leaderboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminLeaderboardRewardsController {
  constructor(private readonly rewardService: AdminLeaderboardRewardService) {}

  @Get('users/:userId/reward-configuration')
  async getRewardConfiguration(
    @Param('userId', new ParseUUIDPipe({ version: '4' }))
    userId: string,
  ) {
    return this.rewardService.getRewardConfiguration(userId);
  }

  @Post('users/:userId/rewards')
  async createReward(
    @Param('userId', new ParseUUIDPipe({ version: '4' }))
    userId: string,
    @Body() dto: CreateLeaderboardRewardDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rewardService.createReward({
      adminUserId: this.getUserId(request),
      userId,
      dto,
    });
  }

  @Get('rewards/summary')
  async getSummary() {
    return this.rewardService.getSummary();
  }

  @Get('rewards')
  async findRewardHistory(@Query() query: RewardHistoryQueryDto) {
    return this.rewardService.findRewardHistory(query);
  }

  @Get('rewards/:rewardId')
  async findRewardById(
    @Param('rewardId', new ParseUUIDPipe({ version: '4' }))
    rewardId: string,
  ) {
    return this.rewardService.findRewardById(rewardId);
  }

  @Patch('rewards/:rewardId/status')
  async updateRewardStatus(
    @Param('rewardId', new ParseUUIDPipe({ version: '4' }))
    rewardId: string,
    @Body() dto: UpdateRewardStatusDto,
  ) {
    return this.rewardService.updateRewardStatus(rewardId, dto);
  }

  @Post('rewards/:rewardId/request-address')
  async requestShippingAddress(
    @Param('rewardId', new ParseUUIDPipe({ version: '4' }))
    rewardId: string,
  ) {
    return this.rewardService.requestShippingAddress(rewardId);
  }

  @Post('rewards/:rewardId/send-update')
  async sendUpdateNotification(
    @Param('rewardId', new ParseUUIDPipe({ version: '4' }))
    rewardId: string,
    @Body() dto: SendRewardUpdateDto,
  ) {
    return this.rewardService.sendUpdateNotification(rewardId, dto);
  }

  @Put('rewards/:rewardId/shipping-address')
  async updateShippingAddress(
    @Param('rewardId', new ParseUUIDPipe({ version: '4' }))
    rewardId: string,
    @Body() dto: RewardShippingAddressDto,
  ) {
    return this.rewardService.updateShippingAddress(rewardId, dto);
  }

  @Post('rewards/:rewardId/dispatch')
  async dispatchReward(
    @Param('rewardId', new ParseUUIDPipe({ version: '4' }))
    rewardId: string,
    @Body() dto: DispatchLeaderboardRewardDto,
  ) {
    return this.rewardService.dispatchReward(rewardId, dto);
  }

  @Post('rewards/:rewardId/deliver')
  async markDelivered(
    @Param('rewardId', new ParseUUIDPipe({ version: '4' }))
    rewardId: string,
  ) {
    return this.rewardService.markDelivered(rewardId);
  }

  @Post('rewards/:rewardId/revoke')
  async revokeReward(
    @Param('rewardId', new ParseUUIDPipe({ version: '4' }))
    rewardId: string,
  ) {
    return this.rewardService.revokeReward(rewardId);
  }

  private getUserId(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated admin user not found.');
    }

    return id;
  }
}
