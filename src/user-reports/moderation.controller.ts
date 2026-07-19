import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { ModerationService } from './moderation.service';

@Controller('api/v1/moderation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('dashboard/metrics')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.LEAD_MODERATOR)
  async getMetrics() {
    return this.moderationService.getDashboardMetrics();
  }

  @Get('reports')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.LEAD_MODERATOR)
  async listReports(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('status') status?: string,
    @Query('reason') reason?: string,
    @Query('search') search?: string,
  ) {
    const parsedPage = Number.parseInt(page, 10) || 1;
    const parsedLimit = Number.parseInt(limit, 10) || 10;

    return this.moderationService.listReports(
      parsedPage,
      parsedLimit,
      status,
      reason,
      search,
    );
  }

  @Get('reports/:caseNumber')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.LEAD_MODERATOR)
  async getReport(@Param('caseNumber') caseNumber: string) {
    const normalizedCaseNumber = caseNumber?.trim();

    if (!normalizedCaseNumber) {
      throw new BadRequestException('caseNumber is required');
    }

    return this.moderationService.getReportByCaseNumber(normalizedCaseNumber);
  }

  @Post('reports/:id/action')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.LEAD_MODERATOR)
  async actionOnReport(
    @Param('id') id: string,
    @Body() body: { action_type: string; action_reason: string },
    @Req() req: any,
  ) {
    if (!body?.action_reason?.trim()) {
      throw new BadRequestException('action_reason is required');
    }

    const moderatorId = req.user?.id?.trim();

    if (!moderatorId) {
      throw new BadRequestException('Moderator identity is required');
    }

    return this.moderationService.performAction(id, body, moderatorId);
  }
}
