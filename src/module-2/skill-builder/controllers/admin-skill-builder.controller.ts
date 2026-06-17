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
  AdminCareerTrackQueryDto,
  CreateCareerTrackDto,
  CreateSkillBuilderModuleDto,
  CreateSkillBuilderSentenceDto,
  ModuleQueryDto,
  SentenceQueryDto,
  UpdateCareerTrackDto,
  UpdateCareerTrackResourcesDto,
  UpdateSkillBuilderModuleDto,
  UpdateSkillBuilderSentenceDto,
} from '../dto/admin-skill-builder.dto';
import { AdminSkillBuilderService } from '../services/admin-skill-builder.service';

@Controller('admin/skill-builder')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSkillBuilderController {
  constructor(
    private readonly adminSkillBuilderService: AdminSkillBuilderService,
  ) {}

  @Post('career-tracks')
  async createCareerTrack(
    @Body() dto: CreateCareerTrackDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminSkillBuilderService.createCareerTrack(
      dto,
      this.getAdminId(request),
    );
  }

  @Get('career-tracks/summary')
  async getSummaryMetrics() {
    return this.adminSkillBuilderService.getSummaryMetrics();
  }

  @Get('career-tracks')
  async findCareerTracks(@Query() query: AdminCareerTrackQueryDto) {
    return this.adminSkillBuilderService.findCareerTracks(query);
  }

  @Get('career-tracks/:trackId')
  async findCareerTrackDetails(@Param('trackId') trackId: string) {
    return this.adminSkillBuilderService.findCareerTrackDetails(trackId);
  }

  @Patch('career-tracks/:trackId')
  async updateCareerTrack(
    @Param('trackId') trackId: string,
    @Body() dto: UpdateCareerTrackDto,
  ) {
    return this.adminSkillBuilderService.updateCareerTrack(trackId, dto);
  }

  @Patch('career-tracks/:trackId/resources')
  async updateResources(
    @Param('trackId') trackId: string,
    @Body() dto: UpdateCareerTrackResourcesDto,
  ) {
    return this.adminSkillBuilderService.updateResources(trackId, dto);
  }

  @Delete('career-tracks/:trackId/intro-video')
  async deleteIntroVideo(@Param('trackId') trackId: string) {
    return this.adminSkillBuilderService.deleteIntroVideo(trackId);
  }

  @Post('career-tracks/:trackId/sync')
  async syncCareerTrack(@Param('trackId') trackId: string) {
    return this.adminSkillBuilderService.syncCareerTrack(trackId);
  }

  @Delete('career-tracks/:trackId')
  async deleteCareerTrack(@Param('trackId') trackId: string) {
    return this.adminSkillBuilderService.deleteCareerTrack(trackId);
  }

  @Post('career-tracks/:trackId/modules')
  async createModule(
    @Param('trackId') trackId: string,
    @Body() dto: CreateSkillBuilderModuleDto,
  ) {
    return this.adminSkillBuilderService.createModule(trackId, dto);
  }

  @Get('career-tracks/:trackId/modules')
  async findModules(
    @Param('trackId') trackId: string,
    @Query() query: ModuleQueryDto,
  ) {
    return this.adminSkillBuilderService.findModules(trackId, query);
  }

  @Patch('modules/:moduleId')
  async updateModule(
    @Param('moduleId') moduleId: string,
    @Body() dto: UpdateSkillBuilderModuleDto,
  ) {
    return this.adminSkillBuilderService.updateModule(moduleId, dto);
  }

  @Delete('modules/:moduleId')
  async deleteModule(@Param('moduleId') moduleId: string) {
    return this.adminSkillBuilderService.deleteModule(moduleId);
  }

  @Post('modules/:moduleId/sentences')
  async createSentence(
    @Param('moduleId') moduleId: string,
    @Body() dto: CreateSkillBuilderSentenceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminSkillBuilderService.createSentence(
      moduleId,
      dto,
      this.getAdminId(request),
    );
  }

  @Get('modules/:moduleId/sentences')
  async findSentences(
    @Param('moduleId') moduleId: string,
    @Query() query: SentenceQueryDto,
  ) {
    return this.adminSkillBuilderService.findSentences(moduleId, query);
  }

  @Patch('sentences/:sentenceId')
  async updateSentence(
    @Param('sentenceId') sentenceId: string,
    @Body() dto: UpdateSkillBuilderSentenceDto,
  ) {
    return this.adminSkillBuilderService.updateSentence(sentenceId, dto);
  }

  @Delete('sentences/:sentenceId')
  async deleteSentence(@Param('sentenceId') sentenceId: string) {
    return this.adminSkillBuilderService.deleteSentence(sentenceId);
  }

  private getAdminId(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated admin not found');
    }

    return id;
  }
}
