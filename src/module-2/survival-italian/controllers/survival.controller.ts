import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import {
  CompleteSurvivalItemDto,
  CompleteSurvivalSituationDto,
} from '../dto/survival.dto';
import { SurvivalService } from '../services/survival.service';

@Controller('survival-italian')
@UseGuards(JwtAuthGuard)
export class SurvivalController {
  constructor(private readonly survivalService: SurvivalService) {}

  @Get('situations')
  async findPublishedSituations(@Req() request: AuthenticatedRequest) {
    return this.survivalService.findPublishedSituations(
      this.getUserId(request),
    );
  }

  @Get('situations/:situationId')
  async findSituationDetails(
    @Param('situationId') situationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.survivalService.findPublishedSituationDetails(
      this.getUserId(request),
      situationId,
    );
  }

  @Post('situations/:situationId/complete')
  async completeSituation(
    @Param('situationId') situationId: string,
    @Body() dto: CompleteSurvivalSituationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.survivalService.completeSituation({
      userId: this.getUserId(request),
      situationId,
      dto,
    });
  }

  @Post('items/:itemId/complete')
  async completeItemCompatibility(
    @Param('itemId') itemId: string,
    @Body() dto: CompleteSurvivalItemDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.survivalService.completeItemCompatibility({
      userId: this.getUserId(request),
      itemId,
      dto,
    });
  }

  @Get('progress')
  async getMyProgress(@Req() request: AuthenticatedRequest) {
    return this.survivalService.getMyProgress(this.getUserId(request));
  }

  private getUserId(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return id;
  }
}
