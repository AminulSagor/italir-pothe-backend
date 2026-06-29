import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import { CertificateQueryDto } from '../dto/certificate-query.dto';
import { RevokeCertificateDto } from '../dto/revoke-certificate.dto';
import { Certificate, CertificateStatus } from '../entities/certificate.entity';
import { FilesService } from 'src/files/services/files.service';
import { ExamAttempt } from 'src/module-2/final-exam/entities/exam-attempt.entity';
import { NotificationsService } from 'src/notifications/services/notifications.service';
import { ConfigService } from '@nestjs/config';
import {
  NotificationPriority,
  NotificationType,
} from 'src/notifications/entities/notification-event.entity';
import { ExamVerdict } from 'src/module-2/final-exam/types/final-exam.type';

export interface IssueCertificatePayload {
  examAttemptId: string;
  issuedByAdminId?: string | null;
  pdfFileId?: string | null;
  notifyStudent?: boolean;
}

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    @InjectRepository(Certificate)
    private readonly certificateRepository: Repository<Certificate>,

    @InjectRepository(ExamAttempt)
    private readonly examAttemptRepository: Repository<ExamAttempt>,

    private readonly filesService: FilesService,

    private readonly notificationsService: NotificationsService,

    private readonly configService: ConfigService,
  ) {}

  async issueCertificate(payload: IssueCertificatePayload) {
    const existingCertificate = await this.certificateRepository.findOne({
      where: {
        examAttemptId: payload.examAttemptId,
      },
    });

    if (existingCertificate) {
      throw new BadRequestException(
        'Certificate already issued for this exam attempt',
      );
    }

    const attempt = await this.examAttemptRepository.findOne({
      where: {
        id: payload.examAttemptId,
      },
      relations: {
        user: true,
        course: true,
        examTemplate: true,
        review: true,
      },
    });

    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    if (!attempt.review) {
      throw new BadRequestException(
        'The exam must be evaluated before issuing a certificate',
      );
    }

    if (attempt.review.verdict !== ExamVerdict.PASSED) {
      throw new BadRequestException(
        'Certificate can only be issued for a passed exam',
      );
    }

    const issuedAt = new Date();

    const courseTitle = attempt.course?.title ?? 'Deleted Course';

    const recipientName = attempt.user?.fullName ?? 'Deleted User';

    const courseLevel = this.extractLevelLabel(
      `${attempt.course?.title ?? ''} ${attempt.examTemplate?.title ?? ''}`,
    );

    const finalScore = Number(attempt.review.finalAverageScore ?? 0);

    let certificate = this.certificateRepository.create({
      userId: attempt.userId,

      courseId: attempt.courseId,

      examAttemptId: attempt.id,

      certificateNumber: this.generateCertificateNumber(),

      pdfFileId: payload.pdfFileId ?? null,

      recipientNameSnapshot: recipientName,

      courseTitleSnapshot: courseTitle,

      courseLevelSnapshot: courseLevel,

      scorePercentSnapshot: finalScore.toFixed(2),

      issuedByAdminId: payload.issuedByAdminId ?? null,

      verificationUrl: null,

      status: CertificateStatus.ISSUED,

      issuedAt,

      revokedAt: null,

      revocationReason: null,
    });

    certificate = await this.certificateRepository.save(certificate);

    const verificationBaseUrl = this.configService
      .get<string>('CERTIFICATE_PUBLIC_VERIFY_BASE_URL')
      ?.replace(/\/+$/, '');

    if (verificationBaseUrl) {
      certificate.verificationUrl = `${verificationBaseUrl}/${certificate.id}`;

      certificate = await this.certificateRepository.save(certificate);
    }

    let notificationSent = false;

    if (payload.notifyStudent === true) {
      try {
        await this.notificationsService.createSystemNotificationForUser({
          userId: certificate.userId,

          type: NotificationType.SYSTEM,

          title: 'Your official certificate is ready',

          body: `Your ${
            certificate.courseTitleSnapshot ?? 'course'
          } certificate has been issued.`,

          deepLink: `italirpothe://certificates/${certificate.id}`,

          priority: NotificationPriority.HIGH,
        });

        notificationSent = true;
      } catch (error) {
        this.logger.error(
          `Certificate ${certificate.id} was issued, but notification failed`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return {
      message: 'Certificate issued successfully',

      notificationRequested: payload.notifyStudent === true,

      notificationSent,

      certificate,
    };
  }

  private extractLevelLabel(value: string): string | null {
    return value.toUpperCase().match(/\b(A1|A2|B1|B2|C1|C2)\b/)?.[1] ?? null;
  }

  async findAll(query: CertificateQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    const where: FindOptionsWhere<Certificate> = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.courseId) {
      where.courseId = query.courseId;
    }

    const queryBuilder = this.certificateRepository
      .createQueryBuilder('certificate')
      .leftJoinAndSelect('certificate.user', 'user')
      .leftJoinAndSelect('certificate.course', 'course')
      .leftJoinAndSelect('certificate.examAttempt', 'examAttempt')
      .leftJoinAndSelect('certificate.pdfFile', 'pdfFile')
      .where(where)
      .orderBy('certificate.issuedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search) {
      queryBuilder.andWhere(
        `(
      LOWER(
        certificate.certificateNumber
      ) LIKE :search

      OR LOWER(
        COALESCE(
          certificate.recipientNameSnapshot,
          user.fullName,
          'Deleted User'
        )
      ) LIKE :search

      OR LOWER(
        COALESCE(
          certificate.courseTitleSnapshot,
          course.title,
          'Deleted Course'
        )
      ) LIKE :search

      OR LOWER(
        COALESCE(
          user.email,
          ''
        )
      ) LIKE :search
    )`,
        {
          search: `%${query.search.trim().toLowerCase()}%`,
        },
      );
    }

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    const certificate = await this.certificateRepository.findOne({
      where: { id },
      relations: {
        user: true,
        course: true,
        examAttempt: true,
        pdfFile: true,
      },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    return certificate;
  }

  async findOwnedCertificate(id: string, userId: string) {
    const certificate = await this.findById(id);

    if (certificate.userId !== userId) {
      throw new ForbiddenException(
        'You are not allowed to access this certificate',
      );
    }

    return certificate;
  }

  async findByAttemptId(examAttemptId: string) {
    const certificate = await this.certificateRepository.findOne({
      where: { examAttemptId },
      relations: {
        user: true,
        course: true,
        examAttempt: true,
        pdfFile: true,
      },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    return certificate;
  }

  async findByUser(userId: string) {
    return this.certificateRepository.find({
      where: {
        userId,
        status: CertificateStatus.ISSUED,
      },
      relations: {
        course: true,
        examAttempt: true,
        pdfFile: true,
      },
      order: {
        issuedAt: 'DESC',
      },
    });
  }

  async verifyCertificate(identifier: string) {
    const normalized = identifier.trim();

    const queryBuilder = this.certificateRepository
      .createQueryBuilder('certificate')
      .leftJoinAndSelect('certificate.user', 'user')
      .leftJoinAndSelect('certificate.course', 'course')
      .leftJoinAndSelect('certificate.examAttempt', 'examAttempt')
      .leftJoinAndSelect('certificate.pdfFile', 'pdfFile');

    if (this.isUuid(normalized)) {
      queryBuilder.where(
        `(
        certificate.id =
          :identifier

        OR certificate.certificateNumber =
          :identifier
      )`,
        {
          identifier: normalized,
        },
      );
    } else {
      queryBuilder.where(
        `certificate.certificateNumber =
       :identifier`,
        {
          identifier: normalized,
        },
      );
    }

    const certificate = await queryBuilder.getOne();

    if (!certificate) {
      return {
        isValid: false,
        reason: 'not_found',
        certificate: null,
      };
    }

    const pdfUrl = certificate.pdfFileId
      ? (await this.filesService.createSignedReadUrl(certificate.pdfFileId))
          .signedReadUrl
      : null;

    return {
      isValid: certificate.status === CertificateStatus.ISSUED,

      reason:
        certificate.status === CertificateStatus.ISSUED ? null : 'revoked',

      certificate: {
        id: certificate.id,

        certificateNumber: certificate.certificateNumber,

        recipientName:
          certificate.recipientNameSnapshot ??
          certificate.user?.fullName ??
          'Deleted User',

        courseTitle:
          certificate.courseTitleSnapshot ??
          certificate.course?.title ??
          'Deleted Course',

        courseLevel: certificate.courseLevelSnapshot,

        scorePercent:
          certificate.scorePercentSnapshot === null
            ? null
            : Number(certificate.scorePercentSnapshot),

        status: certificate.status,

        issuedAt: certificate.issuedAt,

        revokedAt: certificate.revokedAt,

        revocationReason: certificate.revocationReason,

        verificationUrl: certificate.verificationUrl,

        pdfUrl,
      },
    };
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  async revokeCertificate(id: string, dto?: RevokeCertificateDto) {
    const certificate = await this.certificateRepository.findOne({
      where: {
        id,
      },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    if (certificate.status === CertificateStatus.REVOKED) {
      throw new BadRequestException('Certificate already revoked');
    }

    certificate.status = CertificateStatus.REVOKED;

    certificate.revokedAt = new Date();

    certificate.revocationReason = dto?.reason?.trim() || null;

    return this.certificateRepository.save(certificate);
  }

  private generateCertificateNumber() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();

    return `CERT-${timestamp}-${random}`;
  }
}
