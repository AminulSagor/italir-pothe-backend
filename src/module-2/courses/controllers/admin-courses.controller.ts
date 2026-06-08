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
import { CreateCourseDto, UpdateCourseDto } from '../dto/course.dto';
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
  async findAllCourses() {
    return this.adminCoursesService.findAllCourses();
  }

  @Get(':courseId')
  async findCourseById(@Param('courseId') courseId: string) {
    return this.adminCoursesService.findCourseById(courseId);
  }

  @Get(':courseId/setup-progress')
  async getCourseSetupProgress(@Param('courseId') courseId: string) {
    return this.adminCoursesService.getCourseSetupProgress(courseId);
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

  @Delete(':courseId')
  async removeCourse(@Param('courseId') courseId: string) {
    return this.adminCoursesService.removeCourse(courseId);
  }
}
