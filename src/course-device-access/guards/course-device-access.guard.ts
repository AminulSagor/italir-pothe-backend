import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { AuthGuard } from '@nestjs/passport';

import { ExamAttempt } from '../../module-2/final-exam/entities/exam-attempt.entity';
import { Lesson } from '../../module-2/lessons/entities/lesson.entity';
import { QuizSession } from '../../module-2/quizzes/entities/quiz-session.entity';
import { VocabularyReviewSession } from '../../module-2/lessons/entities/vocabulary-review-session.entity';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { CourseDeviceAccessService } from '../services/course-device-access.service';

@Injectable()
export class CourseDeviceAccessGuard
  extends AuthGuard('jwt')
  implements OnModuleInit
{
  private readonly logger = new Logger(CourseDeviceAccessGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly service: CourseDeviceAccessService,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(QuizSession)
    private readonly quizSessionRepository: Repository<QuizSession>,
    @InjectRepository(ExamAttempt)
    private readonly examAttemptRepository: Repository<ExamAttempt>,
    @InjectRepository(VocabularyReviewSession)
    private readonly vocabularySessionRepository: Repository<VocabularyReviewSession>,
  ) {
    super();
  }

  onModuleInit() {
    if (!this.enabled) {
      this.logger.warn(
        'COURSE_DEVICE_ENFORCEMENT_ENABLED is not true; legacy mobile API compatibility is active. Enable only after the attested mobile release is rolled out.',
      );
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.enabled) return true;
    await super.canActivate(context);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.id ?? request.user?.sub;
    if (!userId)
      throw new UnauthorizedException('Authenticated user not found.');

    const courseId = await this.resolveCourseId(request);
    const deviceKeyId = this.header(request, 'x-course-device-key-id');
    const accessToken = this.header(request, 'x-course-device-access-token');
    if (!deviceKeyId || !accessToken) {
      throw new ForbiddenException({
        code: 'COURSE_DEVICE_ACCESS_REQUIRED',
        message: 'Verify this device before accessing course content.',
      });
    }
    await this.service.assertCourseAccess({
      userId,
      courseId,
      deviceKeyId,
      accessToken,
    });
    return true;
  }

  private async resolveCourseId(
    request: AuthenticatedRequest,
  ): Promise<string> {
    const params = request.params ?? {};
    const body = (request.body ?? {}) as Record<string, unknown>;
    const direct =
      this.routeParam(params.courseId) ||
      (typeof body.courseId === 'string' ? body.courseId : '');
    if (direct) return direct;

    const lessonId = this.routeParam(params.lessonId);
    if (lessonId) {
      const lesson = await this.lessonRepository.findOne({
        where: { id: lessonId },
        select: { id: true, courseId: true },
      });
      if (!lesson?.courseId)
        throw new NotFoundException('Lesson course was not found.');
      return lesson.courseId;
    }
    const sessionId = this.routeParam(params.sessionId);
    if (sessionId) {
      const session = await this.quizSessionRepository.findOne({
        where: { id: sessionId },
        relations: ['quiz'],
      });
      if (session?.quiz?.courseId) return session.quiz.courseId;
      const vocabularySession = await this.vocabularySessionRepository.findOne({
        where: { id: sessionId },
        relations: ['lesson'],
      });
      if (vocabularySession?.lesson?.courseId) {
        return vocabularySession.lesson.courseId;
      }
      throw new NotFoundException('Course activity was not found.');
    }
    const attemptId = this.routeParam(params.attemptId);
    if (attemptId) {
      const attempt = await this.examAttemptRepository.findOne({
        where: { id: attemptId },
        select: { id: true, courseId: true },
      });
      if (!attempt?.courseId)
        throw new NotFoundException('Exam course was not found.');
      return attempt.courseId;
    }
    throw new ForbiddenException('The protected course could not be resolved.');
  }

  private header(request: Request, name: string): string {
    const value = request.headers[name];
    return Array.isArray(value)
      ? (value[0]?.trim() ?? '')
      : (value?.trim() ?? '');
  }

  private routeParam(value: string | string[] | undefined): string {
    return Array.isArray(value)
      ? (value[0]?.trim() ?? '')
      : (value?.trim() ?? '');
  }

  private get enabled(): boolean {
    return (
      this.config.get<string>('COURSE_DEVICE_ENFORCEMENT_ENABLED') === 'true'
    );
  }
}
