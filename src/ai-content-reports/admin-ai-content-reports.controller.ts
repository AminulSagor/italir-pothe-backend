import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { UserRole } from 'src/users/entities/user.entity';

import { AiContentReportsService } from './ai-content-reports.service';
import { ListAiContentReportsDto } from './dto/list-ai-content-reports.dto';
import { UpdateAiContentReportStatusDto } from './dto/update-ai-content-report-status.dto';

@Controller('api/v1/admin/ai-content-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.LEAD_MODERATOR)
export class AdminAiContentReportsController {
  constructor(
    private readonly aiContentReportsService: AiContentReportsService,
  ) {}

  @Get()
  async listReports(@Query() query: ListAiContentReportsDto) {
    return this.aiContentReportsService.listForAdmin(query);
  }

  @Get(':id')
  async getReport(@Param('id') id: string) {
    return this.aiContentReportsService.getForAdmin(id);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAiContentReportStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const adminId = request.user?.id ?? request.user?.sub;

    if (!adminId) {
      throw new BadRequestException('Authenticated moderator is required.');
    }

    return this.aiContentReportsService.updateStatus(id, dto, adminId);
  }
}
