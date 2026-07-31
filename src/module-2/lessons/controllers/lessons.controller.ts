import {
  Controller,
  Get,
  Param,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { LessonsService } from '../services/lessons.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get(':lessonId/video-access')
  @UseGuards(JwtAuthGuard)
  async getLessonVideoAccess(
    @Param('lessonId') lessonId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.id ?? request.user?.sub;
    const userRole = request.user?.role;

    if (!userId || !userRole) {
      throw new UnauthorizedException('Authenticated user was not found.');
    }

    return this.lessonsService.getLessonVideoAccess({
      lessonId,
      userId,
      userRole,
    });
  }

  @Get(':lessonId')
  async findLessonById(@Param('lessonId') lessonId: string) {
    return this.lessonsService.findLessonById(lessonId);
  }

  @Get(':lessonId/vocabulary')
  async findVocabularyByLesson(@Param('lessonId') lessonId: string) {
    return this.lessonsService.findVocabularyByLesson(lessonId);
  }
}
