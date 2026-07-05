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
  RecordLearningTimeDto,
  WeeklyLearningActivityQueryDto,
} from '../dto/learning-activity.dto';
import { LearningActivityService } from '../services/learning-activity.service';

@Controller('learning-activity')
@UseGuards(JwtAuthGuard)
export class LearningActivityController {
  constructor(
    private readonly learningActivityService: LearningActivityService,
  ) {}

  @Post('time')
  recordTime(
    @Body() dto: RecordLearningTimeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.learningActivityService.recordTime(
      this.getUserId(request),
      dto,
    );
  }

  @Get('weekly')
  getWeeklySummary(
    @Query() query: WeeklyLearningActivityQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.learningActivityService.getWeeklySummary(
      this.getUserId(request),
      query.weekStart,
    );
  }

  private getUserId(request: AuthenticatedRequest): string {
    const userId = request.user?.id ?? request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user not found');
    }
    return userId;
  }
}
