import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { UserRole } from '../../users/entities/user.entity';
import {
  CreateResumeTemplateDto,
  InferResumeTemplateFieldSchemaDto,
  PreviewResumeTemplateDto,
  ResumeTemplateAdminQueryDto,
  SaveResumeTemplateDraftDto,
  UpdateResumeTemplateMetadataDto,
} from '../dto/admin-resume-template.dto';
import { ResumeTemplateService } from '../services/resume-template.service';

@Controller('admin/resume-studio')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminResumeTemplateController {
  constructor(private readonly templateService: ResumeTemplateService) {}

  @Get('template-contract')
  contract() {
    return this.templateService.getTemplateContract();
  }

  @Post('templates/infer-field-schema')
  inferFieldSchema(@Body() dto: InferResumeTemplateFieldSchemaDto) {
    return this.templateService.inferFieldSchema(dto);
  }

  @Post('templates/preview')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline; filename="resume-template-preview.pdf"')
  async preview(@Body() dto: PreviewResumeTemplateDto): Promise<StreamableFile> {
    const rendered = await this.templateService.previewUnsaved(dto);
    return new StreamableFile(rendered.pdfBuffer);
  }

  @Post('templates')
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateResumeTemplateDto) {
    return this.templateService.create(this.requireUserId(request), dto);
  }

  @Get('templates')
  list(@Query() query: ResumeTemplateAdminQueryDto) {
    return this.templateService.listAdmin(query);
  }

  @Get('templates/:id')
  detail(@Param('id') id: string) {
    return this.templateService.getAdminDetail(id);
  }

  @Patch('templates/:id')
  updateMetadata(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateResumeTemplateMetadataDto,
  ) {
    return this.templateService.updateMetadata(this.requireUserId(request), id, dto);
  }

  @Put('templates/:id/draft')
  saveDraft(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SaveResumeTemplateDraftDto,
  ) {
    return this.templateService.saveDraft(this.requireUserId(request), id, dto);
  }

  @Post('templates/:id/publish')
  publish(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.templateService.publish(this.requireUserId(request), id);
  }

  @Post('templates/:id/archive')
  archive(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.templateService.archive(this.requireUserId(request), id);
  }

  private requireUserId(request: AuthenticatedRequest): string {
    const id = request.user?.id ?? request.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing');
    return id;
  }
}
