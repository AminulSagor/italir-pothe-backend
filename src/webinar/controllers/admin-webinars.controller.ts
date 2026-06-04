import {
  Body,
  Controller,
  Delete,
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

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { UserRole } from 'src/users/entities/user.entity';
import {
  CreateWebinarDto,
  PaginationQueryDto,
  UpdateWebinarDto,
} from '../dto/webinar.dto';
import { WebinarsService } from '../services/webinars.service';

@Controller('admin/webinars')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminWebinarsController {
  constructor(private readonly webinarsService: WebinarsService) {}

  @Post()
  async createWebinar(
    @Body() dto: CreateWebinarDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webinarsService.createWebinar(
      dto,
      this.getCurrentAdminId(request),
    );
  }

  @Get('my-upcoming')
  async getMyUpcomingWebinarsList(
    @Query() query: PaginationQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webinarsService.getAdminUpcomingWebinarsList(
      this.getCurrentAdminId(request),
      query,
    );
  }

  @Get('my-drafts')
  async getMyDraftWebinarsList(
    @Query() query: PaginationQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webinarsService.getAdminDraftWebinarsList(
      this.getCurrentAdminId(request),
      query,
    );
  }

  @Get('my-live')
  async getLiveWebinarsList(
    @Query() query: PaginationQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webinarsService.getAdminLiveWebinarsList(
      this.getCurrentAdminId(request),
      query,
    );
  }

  @Patch(':id')
  async updateWebinar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWebinarDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webinarsService.updateWebinar(
      id,
      dto,
      this.getCurrentAdminId(request),
    );
  }

  @Patch(':id/start')
  async startWebinar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webinarsService.startWebinar(
      id,
      this.getCurrentAdminId(request),
    );
  }

  @Patch(':id/end')
  async endWebinar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webinarsService.endWebinar(
      id,
      this.getCurrentAdminId(request),
    );
  }

  @Post(':id/host-token')
  async getHostToken(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webinarsService.getHostToken(
      id,
      this.getCurrentAdminId(request),
    );
  }

  @Get(':id/speaker-requests')
  async getSpeakerRequest(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.webinarsService.getSpeakerRequest(id, query);
  }

  @Patch(':id/speaker-requests/:userId/approve')
  async approveSpeakerRequest(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webinarsService.approveSpeakerRequest(
      id,
      userId,
      this.getCurrentAdminId(request),
    );
  }

  @Patch(':id/speaker-requests/:userId/reject')
  async rejectSpeakerRequest(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.webinarsService.rejectSpeakerRequest(
      id,
      userId,
      this.getCurrentAdminId(request),
    );
  }

  @Delete(':id')
  async deleteWebinar(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.webinarsService.deleteWebinar(id);
  }

  private getCurrentAdminId(request: AuthenticatedRequest): string {
    const adminId = request.user?.id ?? request.user?.sub;

    if (!adminId) {
      throw new UnauthorizedException('Authenticated admin not found');
    }

    return adminId;
  }
}
