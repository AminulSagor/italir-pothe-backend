import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { CreateCvDocumentDto } from '../dto/cv-document.dto';
import { CvTemplateListQueryDto, PaginationQueryDto } from '../dto/cv-template.dto';
import { CvBuilderService } from '../services/cv-builder.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class CvBuilderController {
  constructor(private readonly cvBuilderService: CvBuilderService) {}

  @Get('cv-templates')
  async getTemplates(@Query() query: CvTemplateListQueryDto) {
    return this.cvBuilderService.getActiveTemplates(query);
  }

  @Get('cv-templates/:id')
  async getTemplate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cvBuilderService.getTemplateById(id, true);
  }

  @Post('cv-documents')
  async createDocument(
    @Body() dto: CreateCvDocumentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.cvBuilderService.createDocument(
      dto,
      this.getCurrentUserId(request),
    );
  }

  @Get('cv-documents/my')
  async getMyDocuments(
    @Query() query: PaginationQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.cvBuilderService.getMyDocuments(
      this.getCurrentUserId(request),
      query,
    );
  }

  private getCurrentUserId(request: AuthenticatedRequest): string {
    const userId = request.user?.id ?? request.user?.sub;
    if (!userId) throw new UnauthorizedException('Authenticated user not found');
    return userId;
  }
}
