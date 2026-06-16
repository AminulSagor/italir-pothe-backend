import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
  CreateCvTemplateDto,
  CvTemplateListQueryDto,
  SaveCvDefaultLayoutDto,
  UpdateCvTemplateDto,
} from '../dto/cv-template.dto';
import { CvTemplateStyleType } from '../entities/cv-template.entity';
import { CvBuilderService } from '../services/cv-builder.service';

@Controller('admin/cv-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCvTemplatesController {
  constructor(private readonly cvBuilderService: CvBuilderService) {}

  @Get()
  async getTemplates(@Query() query: CvTemplateListQueryDto) {
    return this.cvBuilderService.getAdminTemplates(query);
  }

  @Post()
  async createTemplate(
    @Body() dto: CreateCvTemplateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.cvBuilderService.createTemplate(
      dto,
      this.getCurrentAdminId(request),
    );
  }


  @Get('default-layouts/:styleType')
  async getDefaultLayout(
    @Param('styleType', new ParseEnumPipe(CvTemplateStyleType))
    styleType: CvTemplateStyleType,
  ) {
    return this.cvBuilderService.getDefaultLayout(styleType);
  }

  @Put('default-layouts/:styleType')
  async saveDefaultLayout(
    @Param('styleType', new ParseEnumPipe(CvTemplateStyleType))
    styleType: CvTemplateStyleType,
    @Body() dto: SaveCvDefaultLayoutDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.cvBuilderService.saveDefaultLayout(
      styleType,
      dto,
      this.getCurrentAdminId(request),
    );
  }

  @Get(':id')
  async getTemplate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cvBuilderService.getTemplateById(id);
  }

  @Patch(':id')
  async updateTemplate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCvTemplateDto,
  ) {
    return this.cvBuilderService.updateTemplate(id, dto);
  }

  @Delete(':id')
  async deleteTemplate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cvBuilderService.deleteTemplate(id);
  }

  private getCurrentAdminId(request: AuthenticatedRequest): string {
    const adminId = request.user?.id ?? request.user?.sub;
    if (!adminId) throw new UnauthorizedException('Authenticated admin not found');
    return adminId;
  }
}
