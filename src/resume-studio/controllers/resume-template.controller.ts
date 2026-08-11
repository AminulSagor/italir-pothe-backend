import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ResumeTemplateQueryDto } from '../dto/resume-document.dto';
import { ResumeTemplateService } from '../services/resume-template.service';

@Controller('resume-studio/templates')
@UseGuards(JwtAuthGuard)
export class ResumeTemplateController {
  constructor(private readonly templateService: ResumeTemplateService) {}

  @Get()
  list(@Query() query: ResumeTemplateQueryDto) {
    return this.templateService.listPublished(query);
  }

  @Get('categories')
  categories() {
    return this.templateService.categories();
  }

  @Get(':id/preview')
  preview(@Param('id') id: string) {
    return this.templateService.getPublishedPreview(id);
  }

}
