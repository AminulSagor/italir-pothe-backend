import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { ResumeTemplateQueryDto } from '../dto/resume-document.dto';
import { ResumeCreditService } from '../services/resume-credit.service';
import { ResumeDocumentService } from '../services/resume-document.service';
import { ResumeTemplateService } from '../services/resume-template.service';

@Controller('resume-studio/templates')
@UseGuards(JwtAuthGuard)
export class ResumeTemplateController {
  constructor(
    private readonly templateService: ResumeTemplateService,
    private readonly documentService: ResumeDocumentService,
    private readonly creditService: ResumeCreditService,
  ) {}

  @Get()
  list(@Query() query: ResumeTemplateQueryDto) {
    return this.templateService.listPublished(query);
  }

  @Get('categories')
  categories() {
    return this.templateService.categories();
  }

  @Get('builder-contract')
  builderContract() {
    return this.templateService.getBuilderContract();
  }

  /**
   * One mobile bootstrap request returns gallery + recent CVs + CV access.
   * This keeps the first CV screen fast and avoids separate wallet/history calls.
   */
  @Get('bootstrap')
  async bootstrap(
    @Req() request: AuthenticatedRequest,
    @Query() query: ResumeTemplateQueryDto,
  ) {
    const userId = this.requireUserId(request);

    const [bootstrap, recentDocuments, cvAccess] = await Promise.all([
      this.templateService.getMobileBootstrap(query),
      this.documentService.listRecent(userId, 4),
      this.creditService.getAccess(userId),
    ]);

    return {
      ...bootstrap,
      recentDocuments,
      cvAccess,
    };
  }

  @Get(':id/preview')
  preview(@Param('id') id: string) {
    return this.templateService.getPublishedPreview(id);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.templateService.getPublishedMobileTemplate(id);
  }

  private requireUserId(request: AuthenticatedRequest): string {
    const id = request.user?.id ?? request.user?.sub;
    if (!id) {
      throw new UnauthorizedException('Authenticated user id is missing');
    }
    return id;
  }
}
