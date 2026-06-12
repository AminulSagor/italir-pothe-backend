import { Controller, Get, Param } from '@nestjs/common';

import { SyllabusService } from '../services/syllabus.service';

@Controller()
export class SyllabusController {
  constructor(private readonly syllabusService: SyllabusService) {}

  @Get('courses/:courseId/syllabus')
  async findCourseSyllabus(@Param('courseId') courseId: string) {
    return this.syllabusService.findCourseSyllabus(courseId);
  }
}
