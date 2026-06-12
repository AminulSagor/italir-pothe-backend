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
  CreateExamQuestionDto,
  CreateExamSectionDto,
  CreateExamTemplateDto,
  ExamListQueryDto,
  UpdateExamQuestionDto,
  UpdateExamSectionDto,
  UpdateExamTemplateDto,
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

  @Post(':examTemplateId/sections')
  async createSection(
    @Param('examTemplateId') examTemplateId: string,
    @Body() dto: CreateExamSectionDto,
  ) {
    return this.adminExamsService.createSection(examTemplateId, dto);
  }

  @Patch('sections/:sectionId')
  async updateSection(
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateExamSectionDto,
  ) {
    return this.adminExamsService.updateSection(sectionId, dto);
  }

  @Delete('sections/:sectionId')
  async archiveSection(@Param('sectionId') sectionId: string) {
    return this.adminExamsService.archiveSection(sectionId);
  }

  @Post('sections/:sectionId/questions')
  async createQuestion(
    @Param('sectionId') sectionId: string,
    @Body() dto: CreateExamQuestionDto,
  ) {
    return this.adminExamsService.createQuestion(sectionId, dto);
  }

  @Get('sections/:sectionId/questions')
  async findQuestionsBySection(@Param('sectionId') sectionId: string) {
    return this.adminExamsService.findQuestionsBySection(sectionId);
  }

  @Get('questions/:questionId')
  async findQuestionById(@Param('questionId') questionId: string) {
    return this.adminExamsService.findQuestionById(questionId);
  }

  @Patch('questions/:questionId')
  async updateQuestion(
    @Param('questionId') questionId: string,
    @Body() dto: UpdateExamQuestionDto,
  ) {
    return this.adminExamsService.updateQuestion(questionId, dto);
  }

  @Delete('questions/:questionId')
  async archiveQuestion(@Param('questionId') questionId: string) {
    return this.adminExamsService.archiveQuestion(questionId);
  }
}
