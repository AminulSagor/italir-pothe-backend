import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Course, CourseStatus } from '../../courses/entities/course.entity';
import { LessonStatus } from '../../lessons/entities/lesson.entity';
import { CourseChapter } from '../entities/course-chapter.entity';

@Injectable()
export class SyllabusService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,

    @InjectRepository(CourseChapter)
    private readonly courseChapterRepository: Repository<CourseChapter>,
  ) {}

  async findCourseSyllabus(courseId: string) {
    const course = await this.courseRepository.findOne({
      where: {
        id: courseId,
        status: CourseStatus.PUBLISHED,
      },
    });

    if (!course) {
      throw new NotFoundException('Course not found.');
    }

    const chapters = await this.courseChapterRepository.find({
      where: {
        courseId,
        isPublished: true,
      },
      relations: {
        lessons: true,
      },
      order: {
        sortOrder: 'ASC',
        createdAt: 'ASC',
        lessons: {
          sortOrder: 'ASC',
          createdAt: 'ASC',
        },
      },
    });

    return {
      course,
      chapters: chapters.map((chapter) => ({
        ...chapter,
        lessons: [...(chapter.lessons ?? [])]
          .filter((lesson) => lesson.status === LessonStatus.PUBLISHED)
          .sort((a, b) => a.sortOrder - b.sortOrder),
      })),
    };
  }
}
