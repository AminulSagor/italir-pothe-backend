import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { ReviewImportantVerbDto } from '../dto/important-verb-progress.dto';
import { ImportantVerbsService } from '../services/important-verbs.service';

@Controller('important-verbs')
@UseGuards(JwtAuthGuard)
export class ImportantVerbsController {
  constructor(private readonly importantVerbsService: ImportantVerbsService) {}

  @Post(':verbId/reviewed')
  async reviewVerb(
    @Param('verbId') verbId: string,
    @Body() dto: ReviewImportantVerbDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.importantVerbsService.reviewVerb({
      userId: this.getUserId(request),
      verbId,
      dto,
    });
  }

  @Get('progress')
  async getMyProgress(@Req() request: AuthenticatedRequest) {
    return this.importantVerbsService.getMyProgress(this.getUserId(request));
  }

  private getUserId(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return id;
  }
}
