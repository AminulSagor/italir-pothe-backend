import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/users/entities/user.entity';
import {
  CreateQuizDto,
  CreateQuizQuestionDto,
  UpdateQuizDto,
  UpdateQuizQuestionDto,
} from '../dto/admin-quiz.dto';
import { AdminQuizzesService } from '../services/admin-quizzes.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminQuizzesController {
  constructor(private readonly adminQuizzesService: AdminQuizzesService) {}

  @Post('lessons/:lessonId/quizzes')
  async createQuiz(
    @Param('lessonId') lessonId: string,
    @Body() dto: CreateQuizDto,
  ) {
    return this.adminQuizzesService.createQuiz(lessonId, dto);
  }

  @Get('lessons/:lessonId/quizzes')
  async findQuizzesByLesson(@Param('lessonId') lessonId: string) {
    return this.adminQuizzesService.findQuizzesByLesson(lessonId);
  }

  @Get('quizzes/:quizId')
  async findQuizById(@Param('quizId') quizId: string) {
    return this.adminQuizzesService.findQuizById(quizId);
  }

  @Patch('quizzes/:quizId')
  async updateQuiz(
    @Param('quizId') quizId: string,
    @Body() dto: UpdateQuizDto,
  ) {
    return this.adminQuizzesService.updateQuiz(quizId, dto);
  }

  @Patch('quizzes/:quizId/publish')
  async publishQuiz(@Param('quizId') quizId: string) {
    return this.adminQuizzesService.publishQuiz(quizId);
  }

  @Patch('quizzes/:quizId/unpublish')
  async unpublishQuiz(@Param('quizId') quizId: string) {
    return this.adminQuizzesService.unpublishQuiz(quizId);
  }

  @Delete('quizzes/:quizId')
  async archiveQuiz(@Param('quizId') quizId: string) {
    return this.adminQuizzesService.archiveQuiz(quizId);
  }

  @Post('quizzes/:quizId/questions')
  async createQuestion(
    @Param('quizId') quizId: string,
    @Body() dto: CreateQuizQuestionDto,
  ) {
    return this.adminQuizzesService.createQuestion(quizId, dto);
  }

  @Get('quizzes/:quizId/questions')
  async findQuestionsByQuiz(@Param('quizId') quizId: string) {
    return this.adminQuizzesService.findQuestionsByQuiz(quizId);
  }

  @Get('quiz-questions/:questionId')
  async findQuestionById(@Param('questionId') questionId: string) {
    return this.adminQuizzesService.findQuestionById(questionId);
  }

  @Patch('quiz-questions/:questionId')
  async updateQuestion(
    @Param('questionId') questionId: string,
    @Body() dto: UpdateQuizQuestionDto,
  ) {
    return this.adminQuizzesService.updateQuestion(questionId, dto);
  }

  @Delete('quiz-questions/:questionId')
  async archiveQuestion(@Param('questionId') questionId: string) {
    return this.adminQuizzesService.archiveQuestion(questionId);
  }
}
