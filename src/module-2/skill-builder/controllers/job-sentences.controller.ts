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
import { ReviewJobSentenceDto } from '../dto/job-sentence-progress.dto';
import { JobSentencesService } from '../services/job-sentences.service';

@Controller('job-sentences')
@UseGuards(JwtAuthGuard)
export class JobSentencesController {
  constructor(private readonly jobSentencesService: JobSentencesService) {}

  @Post(':sentenceId/reviewed')
  async reviewSentence(
    @Param('sentenceId') sentenceId: string,
    @Body() dto: ReviewJobSentenceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.jobSentencesService.reviewSentence({
      userId: this.getUserId(request),
      sentenceId,
      dto,
    });
  }

  @Get('progress')
  async getMyProgress(@Req() request: AuthenticatedRequest) {
    return this.jobSentencesService.getMyProgress(this.getUserId(request));
  }

  private getUserId(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return id;
  }
}
