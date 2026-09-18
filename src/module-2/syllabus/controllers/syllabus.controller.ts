import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import { SyllabusService } from '../services/syllabus.service';
import { CourseDeviceAccessGuard } from '../../../course-device-access/guards/course-device-access.guard';

@Controller()
export class SyllabusController {
  constructor(private readonly syllabusService: SyllabusService) {}

  @Get('courses/:courseId/syllabus')
  @UseGuards(CourseDeviceAccessGuard)
  async findCourseSyllabus(@Param('courseId') courseId: string) {
    return this.syllabusService.findCourseSyllabus(courseId);
  }
}
