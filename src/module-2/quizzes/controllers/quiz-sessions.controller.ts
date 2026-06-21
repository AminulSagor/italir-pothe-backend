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
  StartQuizSessionDto,
} from '../dto/quiz-session.dto';
import { QuizSessionsService } from '../services/quiz-sessions.service';

@Controller('quiz-sessions')
export class QuizSessionsController {
  constructor(private readonly quizSessionsService: QuizSessionsService) {}

  @Get('lessons/:lessonId/availability')
  async getLessonQuizAvailability(@Param('lessonId') lessonId: string) {
    return this.quizSessionsService.getLessonQuizAvailability(lessonId);
  }

  @Post('lessons/:lessonId/start')
  @UseGuards(JwtAuthGuard)
  async startLessonQuiz(
    @Param('lessonId') lessonId: string,
    @Body() dto: StartQuizSessionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.quizSessionsService.startLessonQuiz(
      lessonId,
      dto,
      this.getCurrentUser(request),
    );
  }

  @Get(':sessionId')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
