import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import {
  MarkLessonCompletedDto,
  MarkTheoryReadDto,
  RecordAudioTrackListenedDto,
  RecordLessonOpenedDto,
  RecordLessonVideoProgressDto,
} from '../dto/progress.dto';
import { ProgressService } from '../services/progress.service';
import { CourseDeviceAccessGuard } from '../../../course-device-access/guards/course-device-access.guard';

@Controller('learning-progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Post('lessons/opened')
  @UseGuards(CourseDeviceAccessGuard)
  async recordLessonOpened(
    @Body() dto: RecordLessonOpenedDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.progressService.recordLessonOpened({
      user: this.getCurrentUser(request),
      courseId: dto.courseId,
      lessonId: dto.lessonId,
    });
  }

  @Post('lessons/video-progress')
  @UseGuards(CourseDeviceAccessGuard)
  async recordVideoProgress(
    @Body() dto: RecordLessonVideoProgressDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.progressService.recordVideoProgress({
      user: this.getCurrentUser(request),
      courseId: dto.courseId,
      lessonId: dto.lessonId,
      watchedPercent: dto.watchedPercent,
      timeSpentSeconds: dto.timeSpentSeconds,
      clientActivityDate: dto.clientActivityDate,
    });
  }

  @Post('lessons/theory-read')
  @UseGuards(CourseDeviceAccessGuard)
  async markTheoryRead(
    @Body() dto: MarkTheoryReadDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.progressService.markTheoryRead({
      user: this.getCurrentUser(request),
      courseId: dto.courseId,
      lessonId: dto.lessonId,
      clientActivityDate: dto.clientActivityDate,
    });
  }

  @Post('lessons/audio-listened')
  @UseGuards(CourseDeviceAccessGuard)
  async recordAudioTrackListened(
    @Body() dto: RecordAudioTrackListenedDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.progressService.recordAudioTrackListened({
      user: this.getCurrentUser(request),
      courseId: dto.courseId,
      lessonId: dto.lessonId,
      audioFileId: dto.audioFileId,
      clientActivityDate: dto.clientActivityDate,
    });
  }

  @Post('lessons/complete')
  @UseGuards(CourseDeviceAccessGuard)
  async markLessonCompleted(
    @Body() dto: MarkLessonCompletedDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.progressService.markLessonCompleted({
      user: this.getCurrentUser(request),
      courseId: dto.courseId,
      lessonId: dto.lessonId,
      clientActivityDate: dto.clientActivityDate,
    });
  }

  @Get('current-chapter')
  async getCurrentChapter(@Req() request: AuthenticatedRequest) {
    return this.progressService.getCurrentChapter(
      this.getCurrentUser(request).id,
    );
  }

  @Get('lessons/:lessonId')
  @UseGuards(CourseDeviceAccessGuard)
  async getLessonProgress(
    @Param('lessonId') lessonId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.progressService.getLessonProgress(
      this.getCurrentUser(request).id,
      lessonId,
    );
  }

  @Get('courses/:courseId')
  @UseGuards(CourseDeviceAccessGuard)
  async getCourseProgress(
    @Param('courseId') courseId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.progressService.getCourseProgress(
      this.getCurrentUser(request).id,
      courseId,
    );
  }

  private getCurrentUser(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return { id };
  }
}
