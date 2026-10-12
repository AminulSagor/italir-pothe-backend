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

interface ResolvedCourseResource {
  courseId: string;
  previewAllowed: boolean;
}

@Injectable()
export class CourseDeviceAccessGuard
  extends AuthGuard('jwt')
  implements OnModuleInit
{
  private static compatibilityWarningLogged = false;
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
    if (!this.enabled && !CourseDeviceAccessGuard.compatibilityWarningLogged) {
      CourseDeviceAccessGuard.compatibilityWarningLogged = true;
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

    const resource = await this.resolveCourseResource(request);
    const requirement = await this.service.getCourseDeviceAccessRequirement(
      resource.courseId,
      userId,
    );
    if (!requirement.requiresDeviceAccess) {
      if (requirement.courseIsFree || resource.previewAllowed) {
        return true;
      }
      throw new ForbiddenException({
        code: 'COURSE_PURCHASE_REQUIRED',
        message: 'Purchase this course to access its paid content.',
      });
    }
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
      courseId: resource.courseId,
      deviceKeyId,
      accessToken,
    });
    return true;
  }

  private async resolveCourseResource(
    request: AuthenticatedRequest,
  ): Promise<ResolvedCourseResource> {
    const params = request.params ?? {};
    const body = (request.body ?? {}) as Record<string, unknown>;
    const lessonId =
      this.routeParam(params.lessonId) ||
      (typeof body.lessonId === 'string' ? body.lessonId.trim() : '');
    if (lessonId) {
      const lesson = await this.lessonRepository.findOne({
        where: { id: lessonId },
        select: { id: true, courseId: true, isFree: true },
      });
      if (!lesson?.courseId)
        throw new NotFoundException('Lesson course was not found.');
      return {
        courseId: lesson.courseId,
        previewAllowed: lesson.isFree,
      };
    }
    const sessionId = this.routeParam(params.sessionId);
    if (sessionId) {
      const session = await this.quizSessionRepository.findOne({
        where: { id: sessionId },
        relations: ['quiz', 'lesson'],
      });
      if (session?.quiz?.courseId) {
        return {
          courseId: session.quiz.courseId,
          previewAllowed: session.lesson?.isFree === true,
        };
      }
      const vocabularySession = await this.vocabularySessionRepository.findOne({
        where: { id: sessionId },
        relations: ['lesson'],
      });
      if (vocabularySession?.lesson?.courseId) {
        return {
          courseId: vocabularySession.lesson.courseId,
          previewAllowed: vocabularySession.lesson.isFree,
        };
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
      return { courseId: attempt.courseId, previewAllowed: false };
    }

    const direct =
      this.routeParam(params.courseId) ||
      (typeof body.courseId === 'string' ? body.courseId.trim() : '');
    if (direct) {
      return {
        courseId: direct,
        previewAllowed: !request.originalUrl.includes('/final-exams/'),
      };
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
