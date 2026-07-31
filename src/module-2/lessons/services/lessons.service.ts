import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { LessonVocabulary } from '../entities/lesson-vocabulary.entity';
import { Lesson, LessonStatus } from '../entities/lesson.entity';
import { FilesService } from 'src/files/services/files.service';
import { CourseCommerceService } from 'src/module-2/course-commerce/services/course-commerce.service';
import { UserRole } from 'src/users/entities/user.entity';

@Injectable()
export class LessonsService {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,

    @InjectRepository(LessonVocabulary)
    private readonly lessonVocabularyRepository: Repository<LessonVocabulary>,

    private readonly filesService: FilesService,
    private readonly courseCommerceService: CourseCommerceService,
  ) {}

  async findLessonById(lessonId: string) {
    const lesson = await this.lessonRepository.findOne({
      where: {
        id: lessonId,
        status: LessonStatus.PUBLISHED,
      },
      relations: {
        chapter: true,
        vocabularyItems: true,
      },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found.');
    }

    lesson.vocabularyItems = [...(lesson.vocabularyItems ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );

    return lesson;
  }

  async getLessonVideoAccess(params: {
    lessonId: string;
    userId: string;
    userRole: UserRole | string;
  }) {
    const lesson = await this.lessonRepository.findOne({
      where: {
        id: params.lessonId,
        status: LessonStatus.PUBLISHED,
      },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found.');
    }

    if (!lesson.videoFileId) {
      throw new NotFoundException('This lesson does not have a video.');
    }

    const isAdmin = params.userRole === UserRole.ADMIN;

    if (!isAdmin && !lesson.isFree) {
      if (!lesson.courseId) {
        throw new ForbiddenException('This lesson is not available.');
      }

      const access = await this.courseCommerceService.getCourseAccess(
        params.userId,
        lesson.courseId,
      );

      if (!access.hasAccess) {
        throw new ForbiddenException(
          'An active course enrollment is required.',
        );
      }
    }

    return this.filesService.getVideoPlaybackAccess(lesson.videoFileId);
  }

  async findVocabularyByLesson(lessonId: string) {
    const lesson = await this.lessonRepository.findOne({
      where: {
        id: lessonId,
        status: LessonStatus.PUBLISHED,
      },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found.');
    }

    return this.lessonVocabularyRepository.find({
      where: {
        lessonId,
      },
      order: {
        sortOrder: 'ASC',
        createdAt: 'ASC',
      },
    });
  }
}
