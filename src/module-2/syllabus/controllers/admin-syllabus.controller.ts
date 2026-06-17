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
  CreateCourseChapterDto,
  ReorderSyllabusDto,
  UpdateCourseChapterDto,
} from '../dto/course-chapter.dto';
import { AdminSyllabusService } from '../services/admin-syllabus.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSyllabusController {
  constructor(private readonly adminSyllabusService: AdminSyllabusService) {}

  @Post('courses/:courseId/chapters')
  async createChapter(
    @Param('courseId') courseId: string,
    @Body() dto: CreateCourseChapterDto,
  ) {
    return this.adminSyllabusService.createChapter(courseId, dto);
  }

  @Get('courses/:courseId/syllabus')
  async findCourseSyllabus(@Param('courseId') courseId: string) {
    return this.adminSyllabusService.findCourseSyllabus(courseId);
  }

  @Get('course-chapters/:chapterId/lessons')
  async findChapterLessons(@Param('chapterId') chapterId: string) {
    return this.adminSyllabusService.findChapterLessons(chapterId);
  }

  @Get('courses/:courseId/summary')
  async getCourseSummary(@Param('courseId') courseId: string) {
    return this.adminSyllabusService.getCourseSummary(courseId);
  }

  @Patch('course-chapters/:chapterId')
  async updateChapter(
    @Param('chapterId') chapterId: string,
    @Body() dto: UpdateCourseChapterDto,
  ) {
    return this.adminSyllabusService.updateChapter(chapterId, dto);
  }

  @Delete('course-chapters/:chapterId')
  async removeChapter(@Param('chapterId') chapterId: string) {
    return this.adminSyllabusService.removeChapter(chapterId);
  }

  @Patch('courses/:courseId/syllabus/reorder')
  async reorderSyllabus(
    @Param('courseId') courseId: string,
    @Body() dto: ReorderSyllabusDto,
  ) {
    return this.adminSyllabusService.reorderSyllabus(courseId, dto);
  }
}
