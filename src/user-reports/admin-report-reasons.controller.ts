import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Delete,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/users/entities/user.entity';
import { UserReportsService } from './user-reports.service';

@Controller('admin/report-reasons')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminReportReasonsController {
  constructor(private readonly userReportsService: UserReportsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.LEAD_MODERATOR, UserRole.MODERATOR)
  async listAll() {
    return this.userReportsService.listAllReasons();
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.LEAD_MODERATOR)
  async create(@Body('title') title: string, @Body('isActive') isActive?: boolean) {
    if (!title || !title.trim()) throw new BadRequestException('title is required');
    return this.userReportsService.createReason(title.trim(), isActive ?? true);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.LEAD_MODERATOR)
  async update(@Param('id') id: string, @Body('title') title?: string, @Body('isActive') isActive?: boolean) {
    if (!title && isActive === undefined) throw new BadRequestException('nothing to update');
    return this.userReportsService.updateReason(id, title?.trim(), isActive);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.LEAD_MODERATOR)
  async deactivate(@Param('id') id: string) {
    return this.userReportsService.updateReason(id, undefined, false);
  }
}
