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
  CheckQuizAnswerDto,
  CompleteQuizSessionDto,
} from '../dto/quiz-session.dto';
import { QuizSessionsService } from '../services/quiz-sessions.service';

@Controller('quiz-sessions')
@UseGuards(JwtAuthGuard)
export class QuizSessionsController {
  constructor(private readonly quizSessionsService: QuizSessionsService) {}


  @Get('lessons/:lessonId/availability')
  async getLessonQuizAvailability(@Param('lessonId') lessonId: string) {
    return this.quizSessionsService.getLessonQuizAvailability(lessonId);
  }

  @Post('lessons/:lessonId/start')
  async startLessonQuiz(
    @Param('lessonId') lessonId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.quizSessionsService.startLessonQuiz(
      lessonId,
      this.getCurrentUser(request),
    );
  }

  @Get(':sessionId')
  async findSessionById(
    @Param('sessionId') sessionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.quizSessionsService.findSessionById(
      sessionId,
      this.getCurrentUser(request),
    );
  }

  @Post(':sessionId/answers/check')
  async checkAnswer(
    @Param('sessionId') sessionId: string,
    @Body() dto: CheckQuizAnswerDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.quizSessionsService.checkAnswer(
      sessionId,
      dto,
      this.getCurrentUser(request),
    );
  }

  @Post(':sessionId/complete')
  async completeSession(
    @Param('sessionId') sessionId: string,
    @Body() dto: CompleteQuizSessionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.quizSessionsService.completeSession(
      sessionId,
      dto,
      this.getCurrentUser(request),
    );
  }

  @Get(':sessionId/result')
  async getSessionResult(
    @Param('sessionId') sessionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.quizSessionsService.getSessionResult(
      sessionId,
      this.getCurrentUser(request),
    );
  }

  @Get(':sessionId/review')
  async getSessionReview(
    @Param('sessionId') sessionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.quizSessionsService.getSessionReview(
      sessionId,
      this.getCurrentUser(request),
    );
  }

  @Get(':sessionId/share-card')
  async getSessionShareCard(
    @Param('sessionId') sessionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.quizSessionsService.getSessionShareCard(
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
