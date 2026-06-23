import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { LeaderboardQueryDto } from '../dto/leaderboard.dto';
import { LeaderboardService } from '../services/leaderboard.service';

@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  async getLeaderboard(
    @Query() query: LeaderboardQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.leaderboardService.getLeaderboard(
      this.getUserId(request),
      query,
    );
  }

  @Get('me')
  async getMyStatus(@Req() request: AuthenticatedRequest) {
    return this.leaderboardService.getMyStatus(this.getUserId(request));
  }

  @Get('leagues')
  async getLeagueInformation() {
    return this.leaderboardService.getLeagueInformation();
  }

  @Get('scoring-guide')
  getScoringGuide() {
    return this.leaderboardService.getScoringGuide();
  }

  @Get('promotions/pending')
  async getPendingPromotion(@Req() request: AuthenticatedRequest) {
    return this.leaderboardService.getPendingPromotion(this.getUserId(request));
  }

  @Post('promotions/:promotionId/acknowledge')
  async acknowledgePromotion(
    @Param('promotionId', new ParseUUIDPipe({ version: '4' }))
    promotionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.leaderboardService.acknowledgePromotion(
      this.getUserId(request),
      promotionId,
    );
  }

  @Get('users/:userId/preview')
  async getUserPreview(
    @Param('userId', new ParseUUIDPipe({ version: '4' }))
    userId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.leaderboardService.getUserPreview(
      this.getUserId(request),
      userId,
    );
  }

  private getUserId(request: AuthenticatedRequest): string {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated user not found.');
    }

    return id;
  }
}
