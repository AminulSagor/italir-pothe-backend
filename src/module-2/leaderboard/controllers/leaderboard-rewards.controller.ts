import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import {
  RewardShippingAddressDto,
  UserRewardHistoryQueryDto,
} from '../dto/leaderboard.dto';
import { LeaderboardRewardService } from '../services/leaderboard-reward.service';

@Controller('rewards')
@UseGuards(JwtAuthGuard)
export class LeaderboardRewardsController {
  constructor(private readonly rewardService: LeaderboardRewardService) {}

  @Get('dashboard')
  async getDashboard(@Req() request: AuthenticatedRequest) {
    return this.rewardService.getDashboard(this.getUserId(request));
  }

  @Get('history')
  async findHistory(
    @Query() query: UserRewardHistoryQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rewardService.findHistory(this.getUserId(request), query);
  }

  @Get(':rewardId/download')
  async getDownload(
    @Param('rewardId', new ParseUUIDPipe({ version: '4' }))
    rewardId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rewardService.getDownload(this.getUserId(request), rewardId);
  }

  @Get(':rewardId')
  async findById(
    @Param('rewardId', new ParseUUIDPipe({ version: '4' }))
    rewardId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rewardService.findById(this.getUserId(request), rewardId);
  }

  @Post(':rewardId/seen')
  async markSeen(
    @Param('rewardId', new ParseUUIDPipe({ version: '4' }))
    rewardId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rewardService.markSeen(this.getUserId(request), rewardId);
  }

  @Post(':rewardId/open')
  async openReward(
    @Param('rewardId', new ParseUUIDPipe({ version: '4' }))
    rewardId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rewardService.openReward(this.getUserId(request), rewardId);
  }

  @Put(':rewardId/shipping-address')
  async saveShippingAddress(
    @Param('rewardId', new ParseUUIDPipe({ version: '4' }))
    rewardId: string,
    @Body() dto: RewardShippingAddressDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rewardService.saveShippingAddress(
      this.getUserId(request),
      rewardId,
      dto,
    );
  }

  @Post(':rewardId/confirm-delivery')
  async confirmDelivery(
    @Param('rewardId', new ParseUUIDPipe({ version: '4' }))
    rewardId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rewardService.confirmDelivery(
      this.getUserId(request),
      rewardId,
    );
  }

  private getUserId(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated user not found.');
    }

    return id;
  }
}
