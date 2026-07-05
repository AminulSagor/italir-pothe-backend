import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import {
  PublicCourseCatalogQueryDto,
  PublicCourseQueryDto,
} from '../dto/course.dto';
import { CoursesService } from '../services/courses.service';

@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  async findAllCourses(@Query() query: PublicCourseQueryDto) {
    return this.coursesService.findAllCourses(query.provider);
  }

  @Get('catalog')
  async findCourseCatalog(@Query() query: PublicCourseCatalogQueryDto) {
    return this.coursesService.findCourseCatalog(query);
  }

  @Get(':courseId')
  async findCourseById(
    @Param('courseId', new ParseUUIDPipe({ version: '4' }))
    courseId: string,
    @Query() query: PublicCourseQueryDto,
  ) {
    return this.coursesService.findCourseById(courseId, query.provider);
  }
}
