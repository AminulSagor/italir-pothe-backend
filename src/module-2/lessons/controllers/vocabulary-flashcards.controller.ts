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
import {
  CompleteVocabularyReviewDto,
  CompleteWeakVocabularyReviewDto,
  StartVocabularyReviewSessionDto,
} from '../dto/vocabulary-flashcard.dto';
import { VocabularyFlashcardsService } from '../services/vocabulary-flashcards.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class VocabularyFlashcardsController {
  constructor(
    private readonly vocabularyFlashcardsService: VocabularyFlashcardsService,
  ) {}

  @Get('lessons/:lessonId/vocabulary/flashcards')
  async getLessonFlashcards(
    @Param('lessonId') lessonId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.vocabularyFlashcardsService.getLessonFlashcards(
      lessonId,
      this.getCurrentUser(request),
    );
  }

  @Post('lessons/:lessonId/vocabulary/review-sessions')
  async startSession(
    @Param('lessonId') lessonId: string,
    @Body() dto: StartVocabularyReviewSessionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.vocabularyFlashcardsService.startSession(
      lessonId,
      dto,
      this.getCurrentUser(request),
    );
  }

  @Post('vocabulary-review-sessions/:sessionId/complete')
  async completeSession(
    @Param('sessionId') sessionId: string,
    @Body() dto: CompleteVocabularyReviewDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.vocabularyFlashcardsService.completeSession(
      sessionId,
      dto,
      this.getCurrentUser(request),
    );
  }

  @Get('vocabulary-review-sessions/:sessionId/weak-cards')
  async getWeakCards(
    @Param('sessionId') sessionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.vocabularyFlashcardsService.getWeakCards(
      sessionId,
      this.getCurrentUser(request),
    );
  }

  @Post('vocabulary-review-sessions/:sessionId/weak-review/complete')
  async completeWeakReview(
    @Param('sessionId') sessionId: string,
    @Body() dto: CompleteWeakVocabularyReviewDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.vocabularyFlashcardsService.completeWeakReview(
      sessionId,
      dto,
      this.getCurrentUser(request),
    );
  }

  @Get('vocabulary-review-sessions/:sessionId/result')
  async getSessionResult(
    @Param('sessionId') sessionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.vocabularyFlashcardsService.getSessionResult(
      sessionId,
      this.getCurrentUser(request),
    );
  }

  private getCurrentUser(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return { id };
  }
}
