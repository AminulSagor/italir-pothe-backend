import { Body, Controller, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { ResumeSummarySuggestionDto } from '../dto/resume-ai.dto';
import { ResumeAiSuggestionService } from '../services/resume-ai-suggestion.service';

@Controller('resume-studio/ai')
@UseGuards(JwtAuthGuard)
export class ResumeAiController {
  constructor(private readonly aiSuggestionService: ResumeAiSuggestionService) {}

  @Post('summary-suggestions')
  suggestSummary(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ResumeSummarySuggestionDto,
  ) {
    const userId = request.user?.id ?? request.user?.sub;
    if (!userId) throw new UnauthorizedException('Authenticated user id is missing');
    return this.aiSuggestionService.suggestSummary(userId, dto);
  }
}
