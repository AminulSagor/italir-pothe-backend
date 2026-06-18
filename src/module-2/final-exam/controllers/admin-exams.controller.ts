import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/users/entities/user.entity';
import {
  CreateCoreQuizQuestionDto,
  CreateExamTemplateDto,
  CreateListeningMiniMcqQuestionDto,
  ExamListQueryDto,
  LinkFinalExamWithCourseDto,
  UpdateCoreQuizQuestionDto,
  UpdateExamTemplateDto,
  UpdateListeningMiniMcqQuestionDto,
  UpsertSpeakingTaskDto,
  UpsertWritingTaskDto,
} from '../dto/admin-exam.dto';
import { AdminExamsService } from '../services/admin-exams.service';

@Controller('admin/final-exams')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminExamsController {
  constructor(private readonly adminExamsService: AdminExamsService) {}

  @Post()
  async createExam(@Body() dto: CreateExamTemplateDto) {
    return this.adminExamsService.createExam(dto);
  }

  @Get()
  async findAll(@Query() query: ExamListQueryDto) {
    return this.adminExamsService.findAll(query);
  }

  @Patch(':examId/link-course')
  async linkFinalExamWithCourse(
    @Param('examTemplateId') examTemplateId: string,
    @Body() dto: LinkFinalExamWithCourseDto,
  ) {
    return this.adminExamsService.linkFinalExamWithCourse(examTemplateId, dto);
  }

  @Delete(':examId/link-course')
  async unlinkFinalExamFromCourse(
    @Param('examTemplateId') examTemplateId: string,
  ) {
    return this.adminExamsService.unlinkFinalExamFromCourse(examTemplateId);
  }

  @Get('questions/:questionId')
  async findQuestionById(@Param('questionId') questionId: string) {
    return this.adminExamsService.findQuestionById(questionId);
  }

  @Patch('questions/:questionId')
  async updateQuestion(
    @Param('questionId') questionId: string,
    @Body() dto: UpdateCoreQuizQuestionDto,
  ) {
    return this.adminExamsService.updateQuestion(questionId, dto);
  }

  @Delete('questions/:questionId')
  async deleteQuestion(@Param('questionId') questionId: string) {
    return this.adminExamsService.deleteQuestion(questionId);
  }

  @Get(':examTemplateId/setup-progress')
  async getSetupProgress(@Param('examTemplateId') examTemplateId: string) {
    return this.adminExamsService.getSetupProgress(examTemplateId);
  }

  @Get(':examTemplateId')
  async findById(@Param('examTemplateId') examTemplateId: string) {
    return this.adminExamsService.findById(examTemplateId);
  }

  @Patch(':examTemplateId')
  async updateExam(
    @Param('examTemplateId') examTemplateId: string,
    @Body() dto: UpdateExamTemplateDto,
  ) {
    return this.adminExamsService.updateExam(examTemplateId, dto);
  }

  @Patch(':examTemplateId/publish')
  async publishExam(@Param('examTemplateId') examTemplateId: string) {
    return this.adminExamsService.publishExam(examTemplateId);
  }

  @Patch(':examTemplateId/archive')
  async archiveExam(@Param('examTemplateId') examTemplateId: string) {
    return this.adminExamsService.archiveExam(examTemplateId);
  }

  @Delete(':examTemplateId/hard-delete')
  async hardDeleteExam(@Param('examTemplateId') examTemplateId: string) {
    return this.adminExamsService.hardDeleteExam(examTemplateId);
  }

  // -------------------------
  // Part 1: Core Quiz CRUD
  // -------------------------

  @Post(':examTemplateId/core-quiz/questions')
  async createCoreQuizQuestion(
    @Param('examTemplateId') examTemplateId: string,
    @Body() dto: CreateCoreQuizQuestionDto,
  ) {
    return this.adminExamsService.createCoreQuizQuestion(examTemplateId, dto);
  }

  @Get(':examTemplateId/core-quiz/questions')
  async findCoreQuizQuestions(@Param('examTemplateId') examTemplateId: string) {
    return this.adminExamsService.findQuestionsBySectionType(
      examTemplateId,
      'core_quiz',
    );
  }

  @Get(':examTemplateId/core-quiz/questions/:questionId')
  async findCoreQuizQuestionById(
    @Param('examTemplateId') examTemplateId: string,
    @Param('questionId') questionId: string,
  ) {
    return this.adminExamsService.findCoreQuizQuestionById(
      examTemplateId,
      questionId,
    );
  }

  @Patch(':examTemplateId/core-quiz/questions/:questionId')
  async updateCoreQuizQuestion(
    @Param('examTemplateId') examTemplateId: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateCoreQuizQuestionDto,
  ) {
    return this.adminExamsService.updateCoreQuizQuestion(
      examTemplateId,
      questionId,
      dto,
    );
  }

  @Delete(':examTemplateId/core-quiz/questions/:questionId')
  async deleteCoreQuizQuestion(
    @Param('examTemplateId') examTemplateId: string,
    @Param('questionId') questionId: string,
  ) {
    return this.adminExamsService.deleteCoreQuizQuestion(
      examTemplateId,
      questionId,
    );
  }

  @Patch(':examTemplateId/core-quiz/publish')
  async publishCoreQuiz(@Param('examTemplateId') examTemplateId: string) {
    return this.adminExamsService.publishCoreQuiz(examTemplateId);
  }

  // -------------------------
  // Part 2: Listening Mini-MCQ CRUD
  // -------------------------

  @Post(':examTemplateId/listening/questions')
  async createListeningQuestion(
    @Param('examTemplateId') examTemplateId: string,
    @Body() dto: CreateListeningMiniMcqQuestionDto,
  ) {
    return this.adminExamsService.createListeningQuestion(examTemplateId, dto);
  }

  @Get(':examTemplateId/listening/questions')
  async findListeningQuestions(
    @Param('examTemplateId') examTemplateId: string,
  ) {
    return this.adminExamsService.findQuestionsBySectionType(
      examTemplateId,
      'listening_lab',
    );
  }

  @Get(':examTemplateId/listening/questions/:questionId')
  async findListeningQuestionById(
    @Param('examTemplateId') examTemplateId: string,
    @Param('questionId') questionId: string,
  ) {
    return this.adminExamsService.findListeningQuestionById(
      examTemplateId,
      questionId,
    );
  }

  @Patch(':examTemplateId/listening/questions/:questionId')
  async updateListeningQuestion(
    @Param('examTemplateId') examTemplateId: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateListeningMiniMcqQuestionDto,
  ) {
    return this.adminExamsService.updateListeningQuestion(
      examTemplateId,
      questionId,
      dto,
    );
  }

  @Delete(':examTemplateId/listening/questions/:questionId')
  async deleteListeningQuestion(
    @Param('examTemplateId') examTemplateId: string,
    @Param('questionId') questionId: string,
  ) {
    return this.adminExamsService.deleteListeningQuestion(
      examTemplateId,
      questionId,
    );
  }

  @Patch(':examTemplateId/listening/publish')
  async publishListeningLab(@Param('examTemplateId') examTemplateId: string) {
    return this.adminExamsService.publishListeningLab(examTemplateId);
  }

  // -------------------------
  // Part 3: Writing Task CRUD
  // -------------------------

  @Get(':examTemplateId/writing-task')
  async getWritingTask(@Param('examTemplateId') examTemplateId: string) {
    return this.adminExamsService.getWritingTask(examTemplateId);
  }

  @Patch(':examTemplateId/writing-task')
  async upsertWritingTask(
    @Param('examTemplateId') examTemplateId: string,
    @Body() dto: UpsertWritingTaskDto,
  ) {
    return this.adminExamsService.upsertWritingTask(examTemplateId, dto);
  }

  @Delete(':examTemplateId/writing-task')
  async deleteWritingTask(@Param('examTemplateId') examTemplateId: string) {
    return this.adminExamsService.deleteWritingTask(examTemplateId);
  }

  // -------------------------
  // Part 4: Speaking Task CRUD
  // -------------------------

  @Get(':examTemplateId/speaking-task')
  async getSpeakingTask(@Param('examTemplateId') examTemplateId: string) {
    return this.adminExamsService.getSpeakingTask(examTemplateId);
  }

  @Patch(':examTemplateId/speaking-task')
  async upsertSpeakingTask(
    @Param('examTemplateId') examTemplateId: string,
    @Body() dto: UpsertSpeakingTaskDto,
  ) {
    return this.adminExamsService.upsertSpeakingTask(examTemplateId, dto);
  }

  @Delete(':examTemplateId/speaking-task')
  async deleteSpeakingTask(@Param('examTemplateId') examTemplateId: string) {
    return this.adminExamsService.deleteSpeakingTask(examTemplateId);
  }
}
