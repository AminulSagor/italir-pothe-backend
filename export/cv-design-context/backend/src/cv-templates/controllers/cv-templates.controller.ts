import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

import { CvTemplateQueryDto } from '../dto/cv-template-query.dto';
import { CvTemplatesService } from '../services/cv-templates.service';

@Controller('cv-templates')
@UseGuards(JwtAuthGuard)
export class CvTemplatesController {
  constructor(private readonly cvTemplatesService: CvTemplatesService) {}

  @Get()
  async getTemplates(@Query() query: CvTemplateQueryDto) {
    return this.cvTemplatesService.findAll(query);
  }

  @Get(':id')
  async getTemplate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cvTemplatesService.findById(id);
  }
}
