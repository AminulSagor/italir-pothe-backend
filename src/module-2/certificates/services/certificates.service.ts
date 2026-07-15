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
import { CertificateGenerationService } from './certificate-generation.service';
import { UserRole } from 'src/users/entities/user.entity';
import { FilePurpose } from 'src/files/entities/file.entity';

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

    private readonly certificateGenerationService: CertificateGenerationService,
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

    if (payload.pdfFileId) {
      await this.filesService.findActiveFileById(payload.pdfFileId);
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

    try {
      certificate.verificationUrl = this.buildVerificationUrl(certificate.id);

      certificate = await this.certificateRepository.save(certificate);

      if (!certificate.pdfFileId) {
        certificate.pdfFileId =
          await this.generateAndStoreCertificatePdf(certificate);

        certificate = await this.certificateRepository.save(certificate);
      }
    } catch (error) {
      await this.certificateRepository.delete({
        id: certificate.id,
      });

      throw error;
    }

    let notificationSent = false;

    if (payload.notifyStudent === true) {
      try {
        const courseTitle = certificate.courseTitleSnapshot?.trim() || 'course';

        await this.notificationsService.createSystemNotificationForUser({
          userId: certificate.userId,
          type: NotificationType.SYSTEM,
          title: 'Your final exam result is ready',
          body:
            `Your ${courseTitle} result and official certificate are ready. ` +
            'Open your result to review the details.',
          deepLink:
            `italirpothe://final-exams/attempts/` +
            `${certificate.examAttemptId}/result`,
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
      pdfDownload:
        certificate.pdfFileId === null
          ? null
          : await this.filesService.createSignedReadUrl(certificate.pdfFileId),
    };
  }

  async getCertificateDownloadUrl(id: string, userId?: string) {
    const certificate = await this.findById(id);

    if (userId && certificate.userId !== userId) {
      throw new ForbiddenException(
        'You are not allowed to download this certificate',
      );
    }

    if (certificate.status !== CertificateStatus.ISSUED) {
      throw new BadRequestException('Certificate is not active');
    }

    if (!certificate.pdfFileId) {
      throw new NotFoundException('Certificate PDF is not generated yet');
    }

    const signedFile = await this.filesService.createSignedReadUrl(
      certificate.pdfFileId,
    );

    return {
      certificateId: certificate.id,
      certificateNumber: certificate.certificateNumber,
      signedReadUrl: signedFile.signedReadUrl,
      expiresInSeconds: signedFile.expiresInSeconds,
      file: signedFile.file,
    };
  }

  async regenerateCertificatePdf(id: string, adminId: string) {
    const certificate = await this.findById(id);

    if (certificate.status !== CertificateStatus.ISSUED) {
      throw new BadRequestException(
        'Only issued certificates can regenerate a PDF',
      );
    }

    if (!certificate.verificationUrl) {
      certificate.verificationUrl = this.buildVerificationUrl(certificate.id);
    }

    certificate.issuedByAdminId = certificate.issuedByAdminId ?? adminId;

    certificate.pdfFileId =
      await this.generateAndStoreCertificatePdf(certificate);

    const savedCertificate = await this.certificateRepository.save(certificate);

    return {
      message: 'Certificate PDF regenerated successfully',
      certificate: savedCertificate,
      pdfDownload: await this.filesService.createSignedReadUrl(
        savedCertificate.pdfFileId!,
      ),
    };
  }

  private async generateAndStoreCertificatePdf(
    certificate: Certificate,
  ): Promise<string> {
    const verificationUrl =
      certificate.verificationUrl ?? this.buildVerificationUrl(certificate.id);

    const pdfBuffer = await this.certificateGenerationService.generatePdf({
      certificateNumber: certificate.certificateNumber,
      recipientName:
        certificate.recipientNameSnapshot ??
        certificate.user?.fullName ??
        'Student',
      courseTitle:
        certificate.courseTitleSnapshot ??
        certificate.course?.title ??
        'Course',
      issuedAt: certificate.issuedAt,
      verificationUrl,
    });

    const fileName = `${certificate.certificateNumber}.pdf`;

    const createdFile = await this.filesService.createFileFromBuffer(
      pdfBuffer,
      fileName,
      'application/pdf',
      {
        id: certificate.issuedByAdminId ?? certificate.userId,
        role: certificate.issuedByAdminId ? UserRole.ADMIN : UserRole.USER,
      },
      FilePurpose.CERTIFICATE_PDF,
    );

    return createdFile.file.id;
  }

  private buildVerificationUrl(certificateId: string): string {
    const explicitBaseUrl = this.configService
      .get<string>('CERTIFICATE_PUBLIC_VERIFY_BASE_URL')
      ?.trim();

    if (explicitBaseUrl) {
      return `${explicitBaseUrl.replace(/\/+$/, '')}/${certificateId}`;
    }

    const frontendBaseUrl =
      this.configService.get<string>('FRONTEND_URL')?.trim() ??
      this.configService.get<string>('APP_PUBLIC_URL')?.trim() ??
      this.configService.get<string>('WEB_APP_URL')?.trim();

    if (frontendBaseUrl) {
      return `${frontendBaseUrl.replace(
        /\/+$/,
        '',
      )}/certificates/public/verify/${certificateId}`;
    }

    return `https://italir-pothe-web.vercel.app/certificates/public/verify/${certificateId}`;
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
    const cleanIdentifier = identifier.trim();

    const queryBuilder = this.certificateRepository
      .createQueryBuilder('certificate')
      .leftJoinAndSelect('certificate.user', 'user')
      .leftJoinAndSelect('certificate.course', 'course')
      .leftJoinAndSelect('certificate.examAttempt', 'examAttempt')
      .leftJoinAndSelect('certificate.pdfFile', 'pdfFile')
      .where('certificate.certificateNumber = :certificateNumber', {
        certificateNumber: cleanIdentifier,
      });

    if (this.isUuid(cleanIdentifier)) {
      queryBuilder.orWhere('certificate.id = :certificateId', {
        certificateId: cleanIdentifier,
      });
    }

    const certificate = await queryBuilder.getOne();

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    return {
      id: certificate.id,
      certificateNumber: certificate.certificateNumber,
      recipientName: certificate.recipientNameSnapshot,
      courseTitle: certificate.courseTitleSnapshot,
      courseLevel: certificate.courseLevelSnapshot,
      verificationUrl: certificate.verificationUrl,
      status: certificate.status,
      issuedAt: certificate.issuedAt,
      revokedAt: certificate.revokedAt,
      revocationReason: certificate.revocationReason,
      isValid: certificate.status === CertificateStatus.ISSUED,
      pdfFile: certificate.pdfFile
        ? {
            id: certificate.pdfFile.id,
            originalName: certificate.pdfFile.originalName,
            mimeType: certificate.pdfFile.mimeType,
            sizeBytes: certificate.pdfFile.sizeBytes,
          }
        : null,
    };
  }

  private isUuid(value: string): boolean {
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
