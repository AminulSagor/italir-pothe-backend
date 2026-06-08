import { Controller, Get, Param } from '@nestjs/common';

import { CoursesService } from '../services/courses.service';

@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  async findAllCourses() {
    return this.coursesService.findAllCourses();
  }

  @Get(':courseId')
  async findCourseById(@Param('courseId') courseId: string) {
    return this.coursesService.findCourseById(courseId);
  }
}
