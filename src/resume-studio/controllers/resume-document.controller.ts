import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import {
  AutosaveResumeDocumentDto,
  CreateResumeDocumentDto,
  RenderResumeDocumentDto,
  ResumeDocumentQueryDto,
} from '../dto/resume-document.dto';
import { ResumeDocumentService } from '../services/resume-document.service';

@Controller('resume-studio/documents')
@UseGuards(JwtAuthGuard)
export class ResumeDocumentController {
  constructor(private readonly documentService: ResumeDocumentService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateResumeDocumentDto) {
    return this.documentService.create(this.requireUserId(request), dto);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: ResumeDocumentQueryDto) {
    return this.documentService.list(this.requireUserId(request), query);
  }

  @Get('generations/:generationId')
  generation(
    @Req() request: AuthenticatedRequest,
    @Param('generationId') generationId: string,
  ) {
    return this.documentService.generation(this.requireUserId(request), generationId);
  }

  @Get(':id')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.documentService.get(this.requireUserId(request), id);
  }

  @Put(':id')
  autosave(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AutosaveResumeDocumentDto,
  ) {
    return this.documentService.autosave(this.requireUserId(request), id, dto);
  }

  @Post(':id/render')
  render(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: RenderResumeDocumentDto,
  ) {
    return this.documentService.render(this.requireUserId(request), id, dto.templateId);
  }

  @Post(':id/archive')
  archive(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.documentService.archive(this.requireUserId(request), id);
  }

  private requireUserId(request: AuthenticatedRequest): string {
    const id = request.user?.id ?? request.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing');
    return id;
  }
}
