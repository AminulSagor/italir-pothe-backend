import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { PaginationQueryDto } from '../dto/webinar.dto';
import { WebinarsService } from '../services/webinars.service';

@Controller('webinars')
@UseGuards(JwtAuthGuard)
export class WebinarsController {
  constructor(private readonly webinarsService: WebinarsService) {}

  @Get('upcoming')
  async getUpcomingWebinarsList(@Query() query: PaginationQueryDto) {
    return this.webinarsService.getUpcomingWebinarsList(query);
  }

  @Get('live')
  async getLiveWebinarsList(@Query() query: PaginationQueryDto) {
    return this.webinarsService.getLiveWebinarsList(query);
  }

  @Get(':id/participants')
  async getParticipantsList(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.webinarsService.getParticipantsList(id, query);
  }

  @Post(':id/join-token')
  async joinWebinar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webinarsService.joinWebinar(id, this.getCurrentUserId(request));
  }

  @Patch(':id/leave')
  async leaveWebinar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webinarsService.leaveWebinar(id, this.getCurrentUserId(request));
  }

  @Patch(':id/leave-stage')
  async leaveStage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webinarsService.leaveStage(id, this.getCurrentUserId(request));
  }

  @Post(':id/request-to-speak')
  async requestToSpeak(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webinarsService.requestToSpeak(
      id,
      this.getCurrentUserId(request),
    );
  }

  @Post(':id/speaker-token')
  async getSpeakerToken(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webinarsService.getSpeakerToken(
      id,
      this.getCurrentUserId(request),
    );
  }

  private getCurrentUserId(request: AuthenticatedRequest): string {
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return userId;
  }
}
