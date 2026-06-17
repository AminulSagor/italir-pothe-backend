import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import {
  ClaimDailyChallengeTaskDto,
  DailyChallengeQueryDto,
  OpenDailyChestDto,
  RecordLearningActivityDto,
} from '../dto/daily-challenge.dto';
import { DailyChallengesService } from '../services/daily-challenges.service';

@Controller('daily-challenges')
@UseGuards(JwtAuthGuard)
export class DailyChallengesController {
  constructor(
    private readonly dailyChallengesService: DailyChallengesService,
  ) {}

  @Get('today')
  async getToday(
    @Query() query: DailyChallengeQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.dailyChallengesService.getToday(
      this.getCurrentUser(request),
      query.date,
    );
  }

  @Post('activity')
  async recordActivity(
    @Body() dto: RecordLearningActivityDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.dailyChallengesService.recordActivity(
      this.getCurrentUser(request),
      dto,
    );
  }

  @Post('tasks/claim')
  async claimTask(
    @Body() dto: ClaimDailyChallengeTaskDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.dailyChallengesService.claimTask(
      this.getCurrentUser(request),
      dto.taskKey,
      dto.challengeDate,
    );
  }

  @Post('chest/open')
  async openDailyChest(
    @Body() dto: OpenDailyChestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.dailyChallengesService.openDailyChest(
      this.getCurrentUser(request),
      dto.challengeDate,
    );
  }

  private getCurrentUser(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return { id };
  }
}
