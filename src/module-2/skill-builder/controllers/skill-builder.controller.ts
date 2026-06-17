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
import {
  MarkCareerTrackTheoryOpenedDto,
  RecordCareerTrackVideoProgressDto,
  ReviewSkillBuilderSentenceDto,
  UserCareerTrackQueryDto,
  UserSentenceQueryDto,
} from '../dto/skill-builder.dto';
import { SkillBuilderService } from '../services/skill-builder.service';

@Controller('skill-builder')
@UseGuards(JwtAuthGuard)
export class SkillBuilderController {
  constructor(private readonly skillBuilderService: SkillBuilderService) {}

  @Get('career-tracks')
  async findPublishedCareerTracks(
    @Query() query: UserCareerTrackQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.skillBuilderService.findPublishedCareerTracks(
      this.getUserId(request),
      query,
    );
  }

  @Get('career-tracks/:trackId')
  async findPublishedCareerTrackDetails(
    @Param('trackId') trackId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.skillBuilderService.findPublishedCareerTrackDetails(
      this.getUserId(request),
      trackId,
    );
  }

  @Post('career-tracks/:trackId/video-progress')
  async recordCareerTrackVideoProgress(
    @Param('trackId') trackId: string,
    @Body() dto: RecordCareerTrackVideoProgressDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.skillBuilderService.recordCareerTrackVideoProgress({
      userId: this.getUserId(request),
      trackId,
      dto,
    });
  }

  @Post('career-tracks/:trackId/theory-opened')
  async markTheoryOpened(
    @Param('trackId') trackId: string,
    @Body() dto: MarkCareerTrackTheoryOpenedDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.skillBuilderService.markTheoryOpened({
      userId: this.getUserId(request),
      trackId,
      dto,
    });
  }

  @Get('modules/:moduleId/sentences')
  async findModuleSentences(
    @Param('moduleId') moduleId: string,
    @Query() query: UserSentenceQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.skillBuilderService.findModuleSentences(
      this.getUserId(request),
      moduleId,
      query,
    );
  }

  @Post('sentences/:sentenceId/reviewed')
  async reviewSentence(
    @Param('sentenceId') sentenceId: string,
    @Body() dto: ReviewSkillBuilderSentenceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.skillBuilderService.reviewSentence({
      userId: this.getUserId(request),
      sentenceId,
      dto,
    });
  }

  @Get('progress')
  async getMyProgress(@Req() request: AuthenticatedRequest) {
    return this.skillBuilderService.getMyProgress(this.getUserId(request));
  }

  private getUserId(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return id;
  }
}
