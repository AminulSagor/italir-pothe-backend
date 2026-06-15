import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
  AdminSurvivalSituationQueryDto,
  CreateSurvivalSituationDto,
  UpdateSurvivalSituationDto,
} from '../dto/admin-survival.dto';
import { AdminSurvivalService } from '../services/admin-survival.service';

@Controller('admin/survival-italian')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSurvivalController {
  constructor(private readonly adminSurvivalService: AdminSurvivalService) {}

  @Post('situations')
  async create(
    @Body() dto: CreateSurvivalSituationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminSurvivalService.create(dto, this.getAdminId(request));
  }

  @Get('situations/summary')
  async getSummaryMetrics() {
    return this.adminSurvivalService.getSummaryMetrics();
  }

  @Get('situations')
  async findAll(@Query() query: AdminSurvivalSituationQueryDto) {
    return this.adminSurvivalService.findAll(query);
  }

  @Get('situations/:id')
  async findOne(@Param('id') id: string) {
    return this.adminSurvivalService.findOne(id);
  }

  @Patch('situations/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSurvivalSituationDto,
  ) {
    return this.adminSurvivalService.update(id, dto);
  }

  @Patch('situations/:id/publish')
  async publish(@Param('id') id: string) {
    return this.adminSurvivalService.publish(id);
  }

  @Patch('situations/:id/unpublish')
  async unpublish(@Param('id') id: string) {
    return this.adminSurvivalService.unpublish(id);
  }

  @Delete('situations/:id')
  async delete(@Param('id') id: string) {
    return this.adminSurvivalService.delete(id);
  }

  private getAdminId(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated admin not found');
    }

    return id;
  }
}
