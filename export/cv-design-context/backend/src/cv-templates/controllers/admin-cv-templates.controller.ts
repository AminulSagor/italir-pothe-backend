import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/users/entities/user.entity';

import { CreateCvTemplateDto } from '../dto/create-cv-template.dto';
import { CvTemplateQueryDto } from '../dto/cv-template-query.dto';
import { CvTemplatesService } from '../services/cv-templates.service';

@Controller('admin/cv-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCvTemplatesController {
  constructor(private readonly cvTemplatesService: CvTemplatesService) {}

  @Post()
  async createTemplate(@Body() dto: CreateCvTemplateDto) {
    return this.cvTemplatesService.create(dto);
  }

  @Get()
  async getTemplates(@Query() query: CvTemplateQueryDto) {
    return this.cvTemplatesService.findAll(query);
  }

  @Delete(':id')
  async deleteTemplate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cvTemplatesService.delete(id);
  }
}
