import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { CreateRewardedSessionDto } from '../dto/rewarded-ad.dto';
import { RewardedAdsService } from '../services/rewarded-ads.service';

@Controller('rewarded-ads')
export class RewardedAdsController {
  constructor(private readonly rewardedAds: RewardedAdsService) {}

  @Get('config')
  @UseGuards(JwtAuthGuard)
  config(@Req() request: AuthenticatedRequest) {
    return this.rewardedAds.getConfiguration(this.userId(request));
  }

  @Post('sessions')
  @UseGuards(JwtAuthGuard)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateRewardedSessionDto,
  ) {
    return this.rewardedAds.createSession(this.userId(request), dto);
  }

  @Get('sessions/:id')
  @UseGuards(JwtAuthGuard)
  session(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.rewardedAds.getSession(this.userId(request), id);
  }

  @Post('sessions/:id/shown')
  @UseGuards(JwtAuthGuard)
  shown(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.rewardedAds.markClientShown(this.userId(request), id);
  }

  @Post('sessions/:id/earned')
  @UseGuards(JwtAuthGuard)
  earned(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.rewardedAds.markClientEarned(this.userId(request), id);
  }

  @Post('sessions/:id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.rewardedAds.cancelSession(this.userId(request), id);
  }

  @Post('sessions/:id/complete-test')
  @UseGuards(JwtAuthGuard)
  completeTest(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.rewardedAds.completeDevelopmentSession(
      this.userId(request),
      id,
    );
  }

  @Get('ssv')
  ssv(
    @Req() request: { originalUrl: string },
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.rewardedAds.handleSsvCallback(request.originalUrl, query);
  }

  private userId(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user not found.');
    return id;
  }
}
