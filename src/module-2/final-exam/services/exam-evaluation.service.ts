import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  EvaluationQueueQueryDto,
  GiveFinalVerdictDto,
  IssueCertificateDto,
  RequestRetakeDto,
} from '../dto/exam-evaluation.dto';
import { ExamAttempt } from '../entities/exam-attempt.entity';
import { ExamReviewMetric } from '../entities/exam-review-metric.entity';
import { ExamReview } from '../entities/exam-review.entity';
import { ExamAttemptStatus, ExamVerdict } from '../types/final-exam.type';
import { CertificatesService } from 'src/module-2/certificates/services/certificates.service';

@Injectable()
export class ExamEvaluationService {
  constructor(
    private readonly certificatesService: CertificatesService,

    @InjectRepository(ExamAttempt)
    private readonly examAttemptRepository: Repository<ExamAttempt>,

    @InjectRepository(ExamReview)
    private readonly examReviewRepository: Repository<ExamReview>,

    @InjectRepository(ExamReviewMetric)
    private readonly examReviewMetricRepository: Repository<ExamReviewMetric>,
  ) {}

  async getEvaluationQueue(query: EvaluationQueueQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    const statuses = query.status
      ? [query.status]
      : [
          ExamAttemptStatus.UNDER_REVIEW,
          ExamAttemptStatus.EVALUATED,
          ExamAttemptStatus.RETAKE_REQUESTED,
          ExamAttemptStatus.CERTIFICATE_ISSUED,
        ];

    const queryBuilder = this.examAttemptRepository
      .createQueryBuilder('attempt')
      .leftJoinAndSelect('attempt.user', 'user')
      .leftJoinAndSelect('attempt.course', 'course')
      .leftJoinAndSelect('attempt.examTemplate', 'examTemplate')
      .where('attempt.status IN (:...statuses)', { statuses })
      .orderBy('attempt.submittedAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search) {
      queryBuilder.andWhere(
        `(
          LOWER(user.fullName) LIKE :search OR
          LOWER(user.email) LIKE :search OR
          LOWER(attempt.referenceCode) LIKE :search
        )`,
        {
          search: `%${query.search.toLowerCase()}%`,
        },
      );
    }

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      stats: await this.getQueueStats(),
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
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

    return attempt;
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
      await this.issueCertificate(attempt.id, {
        pdfFileId: dto.pdfFileId,
        notifyStudent: dto.notifyStudent,
      });
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
      where: { attemptId: attempt.id },
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

    return this.getEvaluationDetails(attempt.id);
  }

  async issueCertificate(attemptId: string, dto: IssueCertificateDto) {
    const attempt = await this.examAttemptRepository.findOne({
      where: { id: attemptId },
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

    const certificate = await this.certificatesService.issueCertificate({
      userId: attempt.userId,
      courseId: attempt.courseId,
      examAttemptId: attempt.id,
      pdfFileId: dto.pdfFileId ?? null,
    });

    attempt.status = ExamAttemptStatus.CERTIFICATE_ISSUED;
    await this.examAttemptRepository.save(attempt);

    return {
      message: 'Certificate issued successfully',
      notifyStudent: dto.notifyStudent ?? false,
      certificate,
      attempt: await this.getEvaluationDetails(attempt.id),
    };
  }

  private async getQueueStats() {
    const pending = await this.examAttemptRepository.count({
      where: { status: ExamAttemptStatus.UNDER_REVIEW },
    });

    const evaluated = await this.examAttemptRepository.count({
      where: { status: ExamAttemptStatus.EVALUATED },
    });

    const retakeRequested = await this.examAttemptRepository.count({
      where: { status: ExamAttemptStatus.RETAKE_REQUESTED },
    });

    const certificateIssued = await this.examAttemptRepository.count({
      where: { status: ExamAttemptStatus.CERTIFICATE_ISSUED },
    });

    const gradedToday = await this.examAttemptRepository
      .createQueryBuilder('attempt')
      .where('attempt.status IN (:...statuses)', {
        statuses: [
          ExamAttemptStatus.EVALUATED,
          ExamAttemptStatus.RETAKE_REQUESTED,
          ExamAttemptStatus.CERTIFICATE_ISSUED,
        ],
      })
      .andWhere('attempt.updatedAt >= :startOfToday', {
        startOfToday: this.getStartOfToday(),
      })
      .getCount();

    return {
      pending,
      evaluated,
      retakeRequested,
      certificateIssued,
      gradedToday,
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
      where: { reviewId },
    });

    if (!metric) {
      metric = this.examReviewMetricRepository.create({
        reviewId,
      });
    }

    metric.evaluationDurationMinutes = payload.evaluationDurationMinutes;
    metric.scoreReliabilityPercent = payload.scoreReliabilityPercent;

    await this.examReviewMetricRepository.save(metric);
  }

  private getStartOfToday() {
    const date = new Date();

    date.setHours(0, 0, 0, 0);

    return date;
  }
}
