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
import { CreateLessonDto, UpdateLessonDto } from '../dto/lesson.dto';
import {
  CreateLessonVocabularyDto,
  UpdateLessonVocabularyDto,
} from '../dto/lesson-vocabulary.dto';
import { AdminLessonsService } from '../services/admin-lessons.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminLessonsController {
  constructor(private readonly adminLessonsService: AdminLessonsService) {}

  @Post('course-chapters/:chapterId/lessons')
  async createLesson(
    @Param('chapterId') chapterId: string,
    @Body() dto: CreateLessonDto,
  ) {
    return this.adminLessonsService.createLesson(chapterId, dto);
  }

  @Get('lessons/:lessonId')
  async findLessonById(@Param('lessonId') lessonId: string) {
    return this.adminLessonsService.findLessonById(lessonId);
  }

  @Patch('lessons/:lessonId')
  async updateLesson(
    @Param('lessonId') lessonId: string,
    @Body() dto: UpdateLessonDto,
  ) {
    return this.adminLessonsService.updateLesson(lessonId, dto);
  }

  @Patch('lessons/:lessonId/publish')
  async publishLesson(@Param('lessonId') lessonId: string) {
    return this.adminLessonsService.publishLesson(lessonId);
  }

  @Patch('lessons/:lessonId/draft')
  async moveLessonToDraft(@Param('lessonId') lessonId: string) {
    return this.adminLessonsService.moveLessonToDraft(lessonId);
  }

  @Delete('lessons/:lessonId')
  async removeLesson(@Param('lessonId') lessonId: string) {
    return this.adminLessonsService.removeLesson(lessonId);
  }

  @Post('lessons/:lessonId/vocabulary')
  async createVocabularyItem(
    @Param('lessonId') lessonId: string,
    @Body() dto: CreateLessonVocabularyDto,
  ) {
    return this.adminLessonsService.createVocabularyItem(lessonId, dto);
  }

  @Get('lessons/:lessonId/vocabulary')
  async findVocabularyByLesson(@Param('lessonId') lessonId: string) {
    return this.adminLessonsService.findVocabularyByLesson(lessonId);
  }

  @Patch('lesson-vocabulary/:vocabularyId')
  async updateVocabularyItem(
    @Param('vocabularyId') vocabularyId: string,
    @Body() dto: UpdateLessonVocabularyDto,
  ) {
    return this.adminLessonsService.updateVocabularyItem(vocabularyId, dto);
  }

  @Delete('lesson-vocabulary/:vocabularyId')
  async removeVocabularyItem(@Param('vocabularyId') vocabularyId: string) {
    return this.adminLessonsService.removeVocabularyItem(vocabularyId);
  }
}
