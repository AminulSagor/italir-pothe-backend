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
  AdminCourseQueryDto,
  CreateCourseDto,
  UpdateCourseDto,
} from '../dto/course.dto';
import { AdminCoursesService } from '../services/admin-courses.service';

@Controller('admin/courses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCoursesController {
  constructor(private readonly adminCoursesService: AdminCoursesService) {}

  @Post()
  async createCourse(@Body() dto: CreateCourseDto) {
    return this.adminCoursesService.createCourse(dto);
  }

  @Get()
  async findAllCourses(@Query() query: AdminCourseQueryDto) {
    return this.adminCoursesService.findAllCourses(query);
  }

  @Get('summary')
  async getCourseDirectorySummary() {
    return this.adminCoursesService.getCourseDirectorySummary();
  }

  @Get(':courseId/setup-progress')
  async getCourseSetupProgress(@Param('courseId') courseId: string) {
    return this.adminCoursesService.getCourseSetupProgress(courseId);
  }

  @Get(':courseId/permanent-delete-check')
  async getPermanentDeleteCheck(@Param('courseId') courseId: string) {
    return this.adminCoursesService.getPermanentDeleteCheck(courseId);
  }

  @Get(':courseId')
  async findCourseById(@Param('courseId') courseId: string) {
    return this.adminCoursesService.findCourseById(courseId);
  }

  @Patch(':courseId')
  async updateCourse(
    @Param('courseId') courseId: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.adminCoursesService.updateCourse(courseId, dto);
  }

  @Patch(':courseId/publish')
  async publishCourse(@Param('courseId') courseId: string) {
    return this.adminCoursesService.publishCourse(courseId);
  }

  @Patch(':courseId/draft')
  async moveCourseToDraft(@Param('courseId') courseId: string) {
    return this.adminCoursesService.moveCourseToDraft(courseId);
  }

  @Patch(':courseId/restore')
  async restoreArchivedCourse(@Param('courseId') courseId: string) {
    return this.adminCoursesService.restoreArchivedCourse(courseId);
  }

  @Delete(':courseId/permanent')
  async permanentlyDeleteCourse(@Param('courseId') courseId: string) {
    return this.adminCoursesService.permanentlyDeleteCourse(courseId);
  }

  @Delete(':courseId')
  async removeCourse(@Param('courseId') courseId: string) {
    return this.adminCoursesService.removeCourse(courseId);
  }
}
