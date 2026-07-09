import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

import { Course, CourseStatus } from '../../courses/entities/course.entity';
import { Lesson, LessonStatus } from '../../lessons/entities/lesson.entity';
import {
  CreateCourseChapterDto,
  ReorderSyllabusDto,
  UpdateCourseChapterDto,
} from '../dto/course-chapter.dto';
import { CourseChapter } from '../entities/course-chapter.entity';

@Injectable()
export class AdminSyllabusService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,

    @InjectRepository(CourseChapter)
    private readonly courseChapterRepository: Repository<CourseChapter>,

    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  async createChapter(courseId: string, dto: CreateCourseChapterDto) {
    await this.ensureActiveCourseExists(courseId);

    const chapter = this.courseChapterRepository.create({
      courseId,
      title: dto.title,
      sortOrder: dto.sortOrder ?? 0,
      isPublished: dto.isPublished ?? true,
    });

    return this.courseChapterRepository.save(chapter);
  }

  async findCourseSyllabus(courseId: string) {
    await this.ensureActiveCourseExists(courseId);

    const chapters = await this.courseChapterRepository.find({
      where: { courseId },
      order: {
        sortOrder: 'ASC',
        createdAt: 'ASC',
      },
    });

    const chaptersWithLessonCount = await Promise.all(
      chapters.map(async (chapter) => {
        const totalLessons = await this.lessonRepository.count({
          where: {
            courseId,
            chapterId: chapter.id,
            status: Not(LessonStatus.ARCHIVED),
          },
        });

        return {
          courseId: chapter.courseId,
          id: chapter.id,
          title: chapter.title,
          sortOrder: chapter.sortOrder,
          isPublished: chapter.isPublished,
          totalLessons,
        };
      }),
    );

    return {
      chapters: chaptersWithLessonCount,
    };
  }

  async findChapterLessons(chapterId: string) {
    const chapter = await this.getChapterById(chapterId);

    if (!chapter.courseId) {
      throw new BadRequestException(
        'This chapter is detached from a deleted course.',
      );
    }

    await this.ensureActiveCourseExists(chapter.courseId);

    const lessons = await this.lessonRepository.find({
      where: {
        chapterId: chapter.id,
        status: Not(LessonStatus.ARCHIVED),
      },
      order: {
        sortOrder: 'ASC',
        createdAt: 'ASC',
      },
    });

    return {
      id: chapter.id,
      title: chapter.title,
      sortOrder: chapter.sortOrder,
      isPublished: chapter.isPublished,
      lessons: lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        isFree: lesson.isFree,
        sortOrder: lesson.sortOrder,
        status: lesson.status,
      })),
    };
  }

  async getCourseSummary(courseId: string) {
    const course = await this.ensureActiveCourseExists(courseId);

    const chapters = await this.courseChapterRepository.find({
      where: { courseId },
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

    const activeChapters = chapters.map((chapter) => ({
      ...chapter,
      lessons: [...(chapter.lessons ?? [])]
        .filter((lesson) => lesson.status !== LessonStatus.ARCHIVED)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));

    return {
      summary: {
        totalChapters: activeChapters.length,
        totalLessons: activeChapters.reduce(
          (total, chapter) => total + chapter.lessons.length,
          0,
        ),
      },
    };
  }

  async updateChapter(chapterId: string, dto: UpdateCourseChapterDto) {
    const chapter = await this.getChapterById(chapterId);

    if (dto.title !== undefined) {
      chapter.title = dto.title;
    }

    if (dto.sortOrder !== undefined) {
      chapter.sortOrder = dto.sortOrder;
    }

    if (dto.isPublished !== undefined) {
      chapter.isPublished = dto.isPublished;
    }

    return this.courseChapterRepository.save(chapter);
  }

  async removeChapter(chapterId: string) {
    const chapter = await this.getChapterById(chapterId);

    await this.courseChapterRepository.remove(chapter);

    return {
      message: 'Chapter deleted successfully.',
      id: chapterId,
    };
  }

  async reorderSyllabus(courseId: string, dto: ReorderSyllabusDto) {
    await this.ensureActiveCourseExists(courseId);

    for (const chapterOrder of dto.chapters) {
      const chapter = await this.courseChapterRepository.findOne({
        where: {
          id: chapterOrder.chapterId,
          courseId,
        },
      });

      if (!chapter) {
        throw new BadRequestException(
          `Chapter not found: ${chapterOrder.chapterId}`,
        );
      }

      chapter.sortOrder = chapterOrder.sortOrder;
      await this.courseChapterRepository.save(chapter);

      if (chapterOrder.lessons?.length) {
        for (const lessonOrder of chapterOrder.lessons) {
          const lesson = await this.lessonRepository.findOne({
            where: {
              id: lessonOrder.lessonId,
              courseId,
              status: Not(LessonStatus.ARCHIVED),
            },
          });

          if (!lesson) {
            throw new BadRequestException(
              `Lesson not found: ${lessonOrder.lessonId}`,
            );
          }

          lesson.chapterId = chapter.id;
          lesson.sortOrder = lessonOrder.sortOrder;

          await this.lessonRepository.save(lesson);
        }
      }
    }

    return this.findCourseSyllabus(courseId);
  }

  private async ensureActiveCourseExists(courseId: string): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: {
        id: courseId,
      },
    });

    if (!course || course.status === CourseStatus.ARCHIVED) {
      throw new NotFoundException('Course not found.');
    }

    return course;
  }

  private async getChapterById(chapterId: string): Promise<CourseChapter> {
    const chapter = await this.courseChapterRepository.findOne({
      where: {
        id: chapterId,
      },
    });

    if (!chapter) {
      throw new NotFoundException('Chapter not found.');
    }

    return chapter;
  }
}
