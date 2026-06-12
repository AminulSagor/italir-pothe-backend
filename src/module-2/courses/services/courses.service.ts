import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Course, CourseStatus } from '../entities/course.entity';

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
  ) {}

  async findAllCourses() {
    return this.courseRepository.find({
      where: {
        status: CourseStatus.PUBLISHED,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findCourseById(courseId: string) {
    const course = await this.courseRepository.findOne({
      where: {
        id: courseId,
        status: CourseStatus.PUBLISHED,
      },
    });

    if (!course) {
      throw new NotFoundException('Course not found.');
    }

    return course;
  }
}
