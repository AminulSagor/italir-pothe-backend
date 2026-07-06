import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
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
    const p = parseInt(page as any, 10) || 1;
    const l = parseInt(limit as any, 10) || 10;
    return this.moderationService.listReports(p, l, status, reason, search);
  }

  @Get('reports/:caseNumber')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.LEAD_MODERATOR)
  async getReport(@Param('caseNumber') caseNumber: string) {
    return this.moderationService.getReportByCaseNumber(caseNumber);
  }

  @Post('reports/:id/action')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR, UserRole.LEAD_MODERATOR)
  async actionOnReport(@Param('id') id: string, @Body() body: { action_type: string; action_reason: string }, @Req() req: any) {
    if (!body?.action_reason || !body.action_reason.trim()) {
      throw new BadRequestException('action_reason is required');
    }

    const moderatorId = req.user?.id;
    return this.moderationService.performAction(id, body, moderatorId);
  }
}
