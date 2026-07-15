import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';

import {
  EvaluationQueueQueryDto,
  EvaluationQueueSortBy,
  EvaluationQueueSortOrder,
  GiveFinalVerdictDto,
  IssueCertificateDto,
  ReopenEvaluationDto,
  RequestRetakeDto,
} from '../dto/exam-evaluation.dto';
import { ExamAttempt } from '../entities/exam-attempt.entity';
import { ExamReviewMetric } from '../entities/exam-review-metric.entity';
import { ExamReview } from '../entities/exam-review.entity';
import {
  ExamAttemptStatus,
  ExamQuestionStatus,
  ExamReviewMode,
  ExamSectionStatus,
  ExamSectionType,
  ExamVerdict,
} from '../types/final-exam.type';
import { CertificatesService } from 'src/module-2/certificates/services/certificates.service';
import { FilesService } from 'src/files/services/files.service';
import { NotificationsService } from 'src/notifications/services/notifications.service';
import { ExamAnswer } from '../entities/exam-answer.entity';
import { UserCourseProgress } from 'src/module-2/progress/entities/user-course-progress.entity';
import { UserLearningActivityTimeEntry } from 'src/module-2/learning-activity/entities/user-learning-activity-time-entry.entity';
import {
  NotificationPriority,
  NotificationType,
} from 'src/notifications/entities/notification-event.entity';
import { ExamQuestion } from '../entities/exam-question.entity';

@Injectable()
export class ExamEvaluationService {
  private readonly logger = new Logger(ExamEvaluationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly certificatesService: CertificatesService,
    private readonly filesService: FilesService,
    private readonly notificationsService: NotificationsService,

    @InjectRepository(ExamAttempt)
    private readonly examAttemptRepository: Repository<ExamAttempt>,

    @InjectRepository(ExamAnswer)
    private readonly examAnswerRepository: Repository<ExamAnswer>,

    @InjectRepository(ExamReview)
    private readonly examReviewRepository: Repository<ExamReview>,

    @InjectRepository(ExamReviewMetric)
    private readonly examReviewMetricRepository: Repository<ExamReviewMetric>,

    @InjectRepository(UserCourseProgress)
    private readonly courseProgressRepository: Repository<UserCourseProgress>,

    @InjectRepository(UserLearningActivityTimeEntry)
    private readonly learningActivityRepository: Repository<UserLearningActivityTimeEntry>,
  ) {}

  async getEvaluationQueue(query: EvaluationQueueQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const search = query.search?.trim() || null;

    const level = query.level?.trim() || null;

    const sortBy = query.sortBy ?? EvaluationQueueSortBy.TIME_IN_QUEUE;

    const sortOrder = query.sortOrder ?? EvaluationQueueSortOrder.DESC;

    const statuses = query.status
      ? [query.status]
      : [
          ExamAttemptStatus.UNDER_REVIEW,
          ExamAttemptStatus.EVALUATED,
          ExamAttemptStatus.RETAKE_REQUESTED,
          ExamAttemptStatus.CERTIFICATE_ISSUED,
        ];

    const timeInQueueExpression = `
    GREATEST(
      0,
      EXTRACT(
        EPOCH FROM (
          COALESCE(
            "metric"."gradedAt",
            NOW()
          ) - "attempt"."submittedAt"
        )
      )
    )
  `;

    const queryBuilder = this.examAttemptRepository
      .createQueryBuilder('attempt')
      .leftJoinAndSelect('attempt.user', 'user')
      .leftJoinAndSelect('attempt.course', 'course')
      .leftJoinAndSelect('attempt.examTemplate', 'examTemplate')
      .leftJoin('attempt.review', 'review')
      .leftJoin('review.metric', 'metric')
      .addSelect(timeInQueueExpression, 'time_in_queue_seconds')
      .where('attempt.status IN (:...statuses)', {
        statuses,
      })
      .andWhere('attempt.submittedAt IS NOT NULL');

    if (search) {
      queryBuilder.andWhere(
        new Brackets((where) => {
          where
            .where(
              `LOWER(
              COALESCE(
                user.fullName,
                'Deleted User'
              )
            ) LIKE :search`,
            )
            .orWhere(
              `LOWER(
              COALESCE(
                user.email,
                ''
              )
            ) LIKE :search`,
            )
            .orWhere(
              `LOWER(
              attempt.referenceCode
            ) LIKE :search`,
            );
        }),
        {
          search: `%${search.toLowerCase()}%`,
        },
      );
    }

    if (level) {
      queryBuilder.andWhere(
        `(
        LOWER(
          COALESCE(
            course.title,
            ''
          )
        ) LIKE :levelSearch

        OR LOWER(
          COALESCE(
            examTemplate.title,
            ''
          )
        ) LIKE :levelSearch
      )`,
        {
          levelSearch: `%${level.toLowerCase()}%`,
        },
      );
    }

    if (query.courseId) {
      queryBuilder.andWhere('attempt.courseId = :courseId', {
        courseId: query.courseId,
      });
    }

    if (query.examTemplateId) {
      queryBuilder.andWhere(
        `attempt.examTemplateId =
       :examTemplateId`,
        {
          examTemplateId: query.examTemplateId,
        },
      );
    }

    const total = await queryBuilder.getCount();

    const sortMap: Record<EvaluationQueueSortBy, string> = {
      [EvaluationQueueSortBy.TIME_IN_QUEUE]: 'time_in_queue_seconds',

      [EvaluationQueueSortBy.SUBMISSION_DATE]: 'attempt.submittedAt',

      [EvaluationQueueSortBy.STUDENT_NAME]: 'user.fullName',

      [EvaluationQueueSortBy.STATUS]: 'attempt.status',
    };

    const result = await queryBuilder
      .orderBy(sortMap[sortBy], sortOrder, 'NULLS LAST')
      .addOrderBy('attempt.id', EvaluationQueueSortOrder.ASC)
      .skip((page - 1) * limit)
      .take(limit)
      .getRawAndEntities<{
        time_in_queue_seconds?: string | number | null;
      }>();

    return {
      stats: await this.getQueueStats(),

      items: result.entities.map((attempt, index) => {
        const raw = result.raw[index] ?? {};

        const timeInQueueSeconds = Number(raw.time_in_queue_seconds ?? 0);

        const levelLabel = this.extractLevelLabel(
          `${attempt.course?.title ?? ''} ${attempt.examTemplate?.title ?? ''}`,
        );

        return {
          attemptId: attempt.id,

          referenceCode: attempt.referenceCode,

          student: {
            id: attempt.userId,

            fullName: attempt.user?.fullName ?? 'Deleted User',

            email: attempt.user?.email ?? null,

            avatarUrl: attempt.user?.avatarUrl ?? null,

            initials: this.initials(attempt.user?.fullName ?? 'Deleted User'),

            isDeleted: attempt.user === null,
          },

          course: {
            id: attempt.courseId,

            title: attempt.course?.title ?? 'Deleted Course',
          },

          exam: {
            id: attempt.examTemplateId,

            title: attempt.examTemplate?.title ?? 'Final Exam',
          },

          level: levelLabel,

          submissionDate: attempt.submittedAt?.toISOString() ?? null,

          timeInQueueSeconds,

          timeInQueueLabel: this.formatDuration(timeInQueueSeconds),

          status: attempt.status,

          statusLabel: this.getStatusLabel(attempt.status),

          action: this.getQueueAction(attempt.status),
        };
      }),

      meta: this.buildMeta(page, limit, total),

      appliedFilters: {
        search,
        level,
        status: query.status ?? null,
        courseId: query.courseId ?? null,
        examTemplateId: query.examTemplateId ?? null,
        sortBy,
        sortOrder,
      },
    };
  }

  async getEvaluationDetails(attemptId: string) {
    const attempt = await this.examAttemptRepository.findOne({
      where: { id: attemptId },
      relations: {
        user: true,
        course: true,
        examTemplate: true,
        answers: {
          question: true,
          section: true,
          items: true,
        },
        review: {
          metric: true,
        },
      },
      order: {
        answers: {
          createdAt: 'ASC',
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    const autoGrading = await this.calculateAutoGrading(
      attempt.examTemplateId,
      attempt.answers ?? [],
    );

    return {
      ...attempt,
      autoGrading,
    };
  }

  async getCertificationCenter(attemptId: string) {
    const attempt = await this.examAttemptRepository.findOne({
      where: {
        id: attemptId,
      },
      relations: {
        user: true,
        course: true,
        examTemplate: true,
        review: {
          metric: true,
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    if (!attempt.review) {
      throw new BadRequestException(
        'The exam must be evaluated before opening the Certification Center',
      );
    }

    const certificateRows = (await this.dataSource.query(
      `
      SELECT
        certificate.id,
        certificate."certificateNumber",
        certificate."pdfFileId",
        certificate.status,
        certificate."issuedAt",
        certificate."revokedAt",
        certificate."verificationUrl"
      FROM certificates certificate
      WHERE certificate."examAttemptId" = $1
      ORDER BY certificate."issuedAt" DESC NULLS LAST
      LIMIT 1
    `,
      [attempt.id],
    )) as Array<{
      id: string;
      certificateNumber: string;
      pdfFileId: string | null;
      status: string;
      issuedAt: Date | string | null;
      revokedAt: Date | string | null;
      verificationUrl: string | null;
    }>;

    const certificate = certificateRows[0] ?? null;

    let certificatePdfUrl: string | null = null;

    if (certificate?.pdfFileId) {
      try {
        const signedResult = await this.filesService.createSignedReadUrl(
          certificate.pdfFileId,
        );

        certificatePdfUrl = signedResult.signedReadUrl;
      } catch (error) {
        this.logger.warn(
          `Unable to create signed certificate PDF URL for attempt ${attempt.id}`,
        );
      }
    }

    const finalScore = Number(attempt.review.finalAverageScore ?? 0);

    const passed = attempt.review.verdict === ExamVerdict.PASSED;

    const certificateIssued =
      attempt.status === ExamAttemptStatus.CERTIFICATE_ISSUED ||
      certificate !== null;

    return {
      attemptId: attempt.id,
      referenceCode: attempt.referenceCode,

      student: {
        id: attempt.userId,

        fullName: attempt.user?.fullName ?? 'Deleted User',

        email: attempt.user?.email ?? null,

        avatarUrl: attempt.user?.avatarUrl ?? null,

        isDeleted: attempt.user === null,
      },

      course: {
        id: attempt.courseId,

        title: attempt.course?.title ?? 'Deleted Course',

        level: this.extractLevelLabel(
          `${attempt.course?.title ?? ''} ${attempt.examTemplate?.title ?? ''}`,
        ),
      },

      exam: {
        id: attempt.examTemplateId,

        title: attempt.examTemplate?.title ?? 'Final Exam',
      },

      result: {
        finalScore,
        passed,

        label: passed ? 'Passed' : 'Not Met',

        evaluationTitle: passed
          ? `Congratulations, ${attempt.user?.fullName ?? 'Student'}!`
          : 'Evaluation Result: Improvement Needed',

        verdict: attempt.review.verdict,

        teacherComment: attempt.review.teacherComment,

        teacherCommentBn: attempt.review.teacherCommentBn,

        keyStrength: attempt.review.keyStrength,

        criticalGap: attempt.review.criticalGap,
      },

      evaluationMetric: {
        evaluationDurationMinutes:
          attempt.review.metric?.evaluationDurationMinutes ?? 0,

        scoreReliabilityPercent:
          attempt.review.metric?.scoreReliabilityPercent ?? 0,

        gradedAt: attempt.review.metric?.gradedAt ?? null,
      },

      certificate: certificate
        ? {
            id: certificate.id,

            certificateNumber: certificate.certificateNumber,

            status: certificate.status,

            issuedAt: certificate.issuedAt
              ? new Date(certificate.issuedAt).toISOString()
              : null,

            revokedAt: certificate.revokedAt
              ? new Date(certificate.revokedAt).toISOString()
              : null,

            verificationUrl: certificate.verificationUrl,

            pdfFileId: certificate.pdfFileId,

            pdfUrl: certificatePdfUrl,
          }
        : null,

      actions: {
        canIssueCertificate: passed && !certificateIssued,

        canRequestRetake:
          !passed && attempt.status !== ExamAttemptStatus.CERTIFICATE_ISSUED,

        canReEvaluate:
          attempt.status === ExamAttemptStatus.EVALUATED ||
          attempt.status === ExamAttemptStatus.RETAKE_REQUESTED,

        issueCertificateEndpoint: `/admin/final-exam-evaluations/queue/${attempt.id}/issue-certificate`,

        requestRetakeEndpoint: `/admin/final-exam-evaluations/queue/${attempt.id}/retake`,

        reEvaluateEndpoint: `/admin/final-exam-evaluations/queue/${attempt.id}/reopen`,
      },
    };
  }

  async reopenEvaluation(attemptId: string, dto: ReopenEvaluationDto) {
    const attempt = await this.examAttemptRepository.findOne({
      where: {
        id: attemptId,
      },
    });

    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    if (attempt.status === ExamAttemptStatus.CERTIFICATE_ISSUED) {
      throw new BadRequestException(
        'An issued certificate must be revoked before reopening the evaluation',
      );
    }

    if (
      attempt.status !== ExamAttemptStatus.EVALUATED &&
      attempt.status !== ExamAttemptStatus.RETAKE_REQUESTED &&
      attempt.status !== ExamAttemptStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException(
        'Only evaluated, retake-requested, or under-review exams can be reopened',
      );
    }

    if (attempt.status === ExamAttemptStatus.UNDER_REVIEW) {
      return {
        changed: false,
        message: 'This exam is already open for evaluation',
        reason: dto.reason?.trim() ?? null,

        attempt: await this.getEvaluationDetails(attempt.id),
      };
    }

    attempt.status = ExamAttemptStatus.UNDER_REVIEW;

    await this.examAttemptRepository.save(attempt);

    return {
      changed: true,
      message: 'Exam evaluation reopened successfully',

      reason: dto.reason?.trim() ?? null,

      attempt: await this.getEvaluationDetails(attempt.id),
    };
  }

  async giveFinalVerdict(
    attemptId: string,
    dto: GiveFinalVerdictDto,
    adminId: string,
  ) {
    const attempt = await this.getAttemptForEvaluation(attemptId);

    const finalAverageScore =
      dto.finalAverageScore ??
      this.calculateFinalAverageScore(dto.writingScore, dto.speakingScore);

    let review = await this.examReviewRepository.findOne({
      where: { attemptId: attempt.id },
    });

    if (!review) {
      review = this.examReviewRepository.create({
        attemptId: attempt.id,
        reviewedById: adminId,
      });
    }

    review.reviewedById = adminId;
    review.vocabularyUsageScore = dto.vocabularyUsageScore ?? 0;
    review.grammarAccuracyScore = dto.grammarAccuracyScore ?? 0;
    review.fluencyPronunciationScore = dto.fluencyPronunciationScore ?? 0;
    review.writingScore = String(dto.writingScore ?? 0);
    review.speakingScore = String(dto.speakingScore ?? 0);
    review.finalAverageScore = String(finalAverageScore);
    review.teacherComment = dto.teacherComment;
    review.teacherCommentBn = dto.teacherCommentBn ?? null;
    review.keyStrength = dto.keyStrength ?? null;
    review.criticalGap = dto.criticalGap ?? null;
    review.verdict = dto.verdict;

    const savedReview = await this.examReviewRepository.save(review);

    await this.upsertReviewMetric(savedReview.id, {
      evaluationDurationMinutes: dto.evaluationDurationMinutes ?? 0,
      scoreReliabilityPercent: dto.scoreReliabilityPercent ?? 98,
    });

    attempt.status =
      dto.verdict === ExamVerdict.PASSED
        ? ExamAttemptStatus.EVALUATED
        : ExamAttemptStatus.RETAKE_REQUESTED;

    await this.examAttemptRepository.save(attempt);

    if (dto.issueCertificate && dto.verdict === ExamVerdict.PASSED) {
      await this.issueCertificate(
        attempt.id,
        {
          pdfFileId: dto.pdfFileId,
          notifyStudent: dto.notifyStudent,
        },
        adminId,
      );
    }

    return this.getEvaluationDetails(attempt.id);
  }

  async requestRetake(
    attemptId: string,
    dto: RequestRetakeDto,
    adminId: string,
  ) {
    const attempt = await this.getAttemptForEvaluation(attemptId);

    let review = await this.examReviewRepository.findOne({
      where: {
        attemptId: attempt.id,
      },
    });

    if (!review) {
      review = this.examReviewRepository.create({
        attemptId: attempt.id,

        reviewedById: adminId,
      });
    }

    review.reviewedById = adminId;

    review.vocabularyUsageScore = 0;

    review.grammarAccuracyScore = 0;

    review.fluencyPronunciationScore = 0;

    review.writingScore = '0';

    review.speakingScore = '0';

    review.finalAverageScore = '0';

    review.teacherComment = dto.teacherComment;

    review.teacherCommentBn = dto.teacherCommentBn ?? null;

    review.keyStrength = dto.keyStrength ?? null;

    review.criticalGap = dto.criticalGap;

    review.verdict = ExamVerdict.RETAKE_REQUIRED;

    const savedReview = await this.examReviewRepository.save(review);

    await this.upsertReviewMetric(savedReview.id, {
      evaluationDurationMinutes: 0,

      scoreReliabilityPercent: 98,
    });

    attempt.status = ExamAttemptStatus.RETAKE_REQUESTED;

    await this.examAttemptRepository.save(attempt);

    let notificationSent = false;

    if (dto.notifyStudent === true) {
      try {
        await this.notificationsService.createSystemNotificationForUser({
          userId: attempt.userId,

          type: NotificationType.SYSTEM,

          title: 'Final exam retake requested',

          body: 'Your evaluator has requested another attempt. Open your exam result to review the feedback.',

          deepLink: `italirpothe://final-exams/attempts/${attempt.id}/result`,

          priority: NotificationPriority.HIGH,
        });

        notificationSent = true;
      } catch (error) {
        this.logger.error(
          `Retake was requested, but notification delivery failed for user ${attempt.userId}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return {
      message: 'Exam retake requested successfully',

      notificationRequested: dto.notifyStudent ?? false,

      notificationSent,

      attempt: await this.getEvaluationDetails(attempt.id),
    };
  }

  async issueCertificate(
    attemptId: string,
    dto: IssueCertificateDto,
    adminId: string,
  ) {
    const attempt = await this.examAttemptRepository.findOne({
      where: {
        id: attemptId,
      },
      relations: {
        review: true,
        course: true,
        user: true,
        examTemplate: true,
      },
    });

    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    if (!attempt.review) {
      throw new BadRequestException(
        'Exam review must be completed before issuing certificate',
      );
    }

    if (attempt.review.verdict !== ExamVerdict.PASSED) {
      throw new BadRequestException(
        'Certificate can only be issued for passed exams',
      );
    }

    const certificateResult = await this.certificatesService.issueCertificate({
      examAttemptId: attempt.id,

      issuedByAdminId: adminId,

      pdfFileId: dto.pdfFileId ?? null,

      notifyStudent: dto.notifyStudent === true,
    });

    const certificate = certificateResult.certificate;

    attempt.status = ExamAttemptStatus.CERTIFICATE_ISSUED;

    await this.examAttemptRepository.save(attempt);

    this.logger.log(
      `Certificate ${certificate.id} issued by admin ${adminId} for attempt ${attempt.id}`,
    );

    return {
      message: 'Certificate issued successfully',

      notificationRequested: dto.notifyStudent ?? false,

      certificate,

      attempt: await this.getEvaluationDetails(attempt.id),
    };
  }

  private async calculateAutoGrading(
    examTemplateId: string,
    answers: ExamAnswer[],
  ) {
    const autoQuestions = await this.dataSource
      .getRepository(ExamQuestion)
      .createQueryBuilder('question')
      .innerJoinAndSelect('question.section', 'section')
      .where('section.examTemplateId = :examTemplateId', {
        examTemplateId,
      })
      .andWhere('section.sectionType IN (:...sectionTypes)', {
        sectionTypes: [
          ExamSectionType.CORE_QUIZ,
          ExamSectionType.LISTENING_LAB,
        ],
      })
      .andWhere('section.reviewMode = :reviewMode', {
        reviewMode: ExamReviewMode.AUTO,
      })
      .andWhere('section.status = :sectionStatus', {
        sectionStatus: ExamSectionStatus.ACTIVE,
      })
      .andWhere('question.status = :questionStatus', {
        questionStatus: ExamQuestionStatus.ACTIVE,
      })
      .getMany();

    const autoQuestionIds = new Set<string>(
      autoQuestions.map((question) => question.id),
    );

    const autoAnswers = answers.filter((answer) =>
      autoQuestionIds.has(answer.questionId),
    );

    const earnedPoints = autoAnswers.reduce(
      (total, answer) => total + Number(answer.score ?? 0),
      0,
    );

    const possiblePoints = autoQuestions.reduce(
      (total, question) => total + Math.max(1, Number(question.points ?? 1)),
      0,
    );

    const answeredQuestionCount = new Set(
      autoAnswers.map((answer) => answer.questionId),
    ).size;

    const totalQuestionCount = autoQuestions.length;

    const skippedQuestionCount = Math.max(
      0,
      totalQuestionCount - answeredQuestionCount,
    );

    const scorePercent =
      possiblePoints > 0
        ? Number(((earnedPoints / possiblePoints) * 100).toFixed(2))
        : 0;

    const scoreOutOfTen = Number((scorePercent / 10).toFixed(2));

    return {
      earnedPoints,
      possiblePoints,
      scorePercent,
      scoreOutOfTen,
      answeredQuestionCount,
      skippedQuestionCount,
      totalQuestionCount,
    };
  }

  private async getQueueStats() {
    const startOfToday = this.startOfUtcDay(new Date());

    const [pending, gradedToday, averageWaitRow] = await Promise.all([
      this.examAttemptRepository.count({
        where: {
          status: ExamAttemptStatus.UNDER_REVIEW,
        },
      }),

      this.examReviewMetricRepository
        .createQueryBuilder('metric')
        .where('"metric"."gradedAt" >= :startOfToday', {
          startOfToday,
        })
        .getCount(),

      this.examAttemptRepository
        .createQueryBuilder('attempt')
        .select(
          `
          COALESCE(
            AVG(
              EXTRACT(
                EPOCH FROM (
                  NOW() - "attempt"."submittedAt"
                )
              ) / 3600
            ),
            0
          )
        `,
          'averageWaitHours',
        )
        .where('"attempt"."status" = :status', {
          status: ExamAttemptStatus.UNDER_REVIEW,
        })
        .andWhere('"attempt"."submittedAt" IS NOT NULL')
        .getRawOne<{
          averageWaitHours: string | number | null;
        }>(),
    ]);

    const averageWaitHours = Number(averageWaitRow?.averageWaitHours ?? 0);

    return {
      pending,
      gradedToday,
      gradedTodayGoal: 20,

      averageWaitHours: Number(averageWaitHours.toFixed(1)),

      targetWaitHours: 24,

      isWithinTarget: averageWaitHours <= 24,
    };
  }

  private async getAttemptForEvaluation(attemptId: string) {
    const attempt = await this.examAttemptRepository.findOne({
      where: { id: attemptId },
    });

    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    if (
      attempt.status !== ExamAttemptStatus.UNDER_REVIEW &&
      attempt.status !== ExamAttemptStatus.EVALUATED &&
      attempt.status !== ExamAttemptStatus.RETAKE_REQUESTED
    ) {
      throw new BadRequestException(
        'Only submitted exams can be evaluated or re-evaluated',
      );
    }

    return attempt;
  }

  private calculateFinalAverageScore(
    writingScore?: number,
    speakingScore?: number,
  ) {
    const scores: number[] = [];

    if (typeof writingScore === 'number') {
      scores.push(writingScore * 10);
    }

    if (typeof speakingScore === 'number') {
      scores.push(speakingScore * 10);
    }

    if (!scores.length) {
      return 0;
    }

    const total = scores.reduce((sum, score) => sum + score, 0);

    return Number((total / scores.length).toFixed(2));
  }

  private async upsertReviewMetric(
    reviewId: string,
    payload: {
      evaluationDurationMinutes: number;
      scoreReliabilityPercent: number;
    },
  ) {
    let metric = await this.examReviewMetricRepository.findOne({
      where: {
        reviewId,
      },
    });

    if (!metric) {
      metric = this.examReviewMetricRepository.create({
        reviewId,
      });
    }

    metric.evaluationDurationMinutes = payload.evaluationDurationMinutes;

    metric.scoreReliabilityPercent = payload.scoreReliabilityPercent;

    metric.gradedAt = new Date();

    await this.examReviewMetricRepository.save(metric);
  }

  private extractLevelLabel(value: string): string | null {
    return value.toUpperCase().match(/\b(A1|A2|B1|B2|C1|C2)\b/)?.[1] ?? null;
  }

  private initials(fullName: string): string {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
      return 'DU';
    }

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  private formatDuration(totalSeconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));

    const hours = Math.floor(safeSeconds / 3600);

    const minutes = Math.floor((safeSeconds % 3600) / 60);

    if (hours > 0) {
      return minutes > 0 ? `${hours} Hours ${minutes} Mins` : `${hours} Hours`;
    }

    if (minutes > 0) {
      return `${minutes} Mins`;
    }

    return '< 1 Min';
  }

  private getStatusLabel(status: ExamAttemptStatus): string {
    switch (status) {
      case ExamAttemptStatus.UNDER_REVIEW:
        return 'Awaiting Review';

      case ExamAttemptStatus.EVALUATED:
        return 'Evaluated';

      case ExamAttemptStatus.RETAKE_REQUESTED:
        return 'Retake Requested';

      case ExamAttemptStatus.CERTIFICATE_ISSUED:
        return 'Certificate Issued';

      default:
        return status
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (letter) => letter.toUpperCase());
    }
  }

  private getQueueAction(status: ExamAttemptStatus) {
    switch (status) {
      case ExamAttemptStatus.CERTIFICATE_ISSUED:
        return {
          type: 'review_sent',

          label: 'Review Sent',

          enabled: false,
        };

      case ExamAttemptStatus.EVALUATED:
        return {
          type: 'view_result',

          label: 'View Result',

          enabled: true,
        };

      case ExamAttemptStatus.RETAKE_REQUESTED:
        return {
          type: 'grade_now',

          label: 'Grade Now',

          enabled: true,
        };

      case ExamAttemptStatus.UNDER_REVIEW:
      default:
        return {
          type: 'grade_now',

          label: 'Grade Now',

          enabled: true,
        };
    }
  }

  private buildMeta(page: number, limit: number, total: number) {
    const totalPages = Math.ceil(total / limit);

    return {
      page,
      limit,
      total,
      totalPages,

      hasPreviousPage: page > 1,

      hasNextPage: page < totalPages,

      from: total === 0 ? 0 : (page - 1) * limit + 1,

      to: Math.min(page * limit, total),
    };
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }
}
