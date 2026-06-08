import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { LessonVocabulary } from '../entities/lesson-vocabulary.entity';
import { Lesson, LessonStatus } from '../entities/lesson.entity';

@Injectable()
export class LessonsService {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,

    @InjectRepository(LessonVocabulary)
    private readonly lessonVocabularyRepository: Repository<LessonVocabulary>,
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
