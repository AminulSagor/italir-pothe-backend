import { Controller, Get, Param } from '@nestjs/common';

import { LessonsService } from '../services/lessons.service';

@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get(':lessonId')
  async findLessonById(@Param('lessonId') lessonId: string) {
    return this.lessonsService.findLessonById(lessonId);
  }

  @Get(':lessonId/vocabulary')
  async findVocabularyByLesson(@Param('lessonId') lessonId: string) {
    return this.lessonsService.findVocabularyByLesson(lessonId);
  }
}
