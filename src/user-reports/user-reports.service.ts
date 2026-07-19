import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { DataSource, Repository } from 'typeorm';

import { FilePurpose } from 'src/files/entities/file.entity';
import {
  FileRequestUser,
  FilesService,
} from 'src/files/services/files.service';
import { ModerationReport } from 'src/moderation/entities/moderation-report.entity';
import { ReportVisualEvidence } from 'src/moderation/entities/report-visual-evidence.entity';
import { User } from 'src/users/entities/user.entity';

import { ReportReason } from './entities/report-reason.entity';
import { UserReport, UserReportStatus } from './entities/user-report.entity';

@Injectable()
export class UserReportsService {
  constructor(
    @InjectRepository(ReportReason)
    private readonly reportReasonRepository: Repository<ReportReason>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly filesService: FilesService,
    private readonly dataSource: DataSource,
  ) {}

  async createReport(
    reporter: {
      id: string;
      role?: string;
    },
    reportedUserId: string,
    reasonId: string,
    description?: string | null,
    clientReportId?: string | null,
    evidenceFileId?: string | null,
    evidence?: {
      buffer: Buffer;
      originalName: string;
      mimeType: string;
    } | null,
  ) {
    const reporterId = reporter.id?.trim() ?? '';
    const targetUserId = reportedUserId?.trim() ?? '';
    const normalizedReasonId = reasonId?.trim() ?? '';
    const normalizedDescription = description?.trim() ?? '';
    const normalizedClientReportId = clientReportId?.trim() ?? '';

    if (!reporterId) {
      throw new BadRequestException('Reporter identity is required.');
    }

    if (!targetUserId) {
      throw new BadRequestException('reportedUserId is required.');
    }

    if (reporterId === targetUserId) {
      throw new BadRequestException('You cannot report your own account.');
    }

    if (!normalizedReasonId) {
      throw new BadRequestException('reasonId is required.');
    }

    if (normalizedDescription.length > 500) {
      throw new BadRequestException(
        'Description cannot exceed 500 characters.',
      );
    }

    if (normalizedClientReportId.length > 120) {
      throw new BadRequestException(
        'clientReportId cannot exceed 120 characters.',
      );
    }

    if (normalizedClientReportId) {
      const existingReport = await this.findExistingReportResponse(
        reporterId,
        normalizedClientReportId,
      );

      if (existingReport) {
        return existingReport;
      }
    }

    const reportedUser = await this.userRepository.findOne({
      where: {
        id: targetUserId,
      },
    });

    if (!reportedUser) {
      throw new NotFoundException(
        'The user you are trying to report does not exist.',
      );
    }

    const reason = await this.resolveActiveReason(normalizedReasonId);

    let attachedEvidenceFileId: string | null = null;

    let evidenceUrl: string | null = null;

    let createdEvidenceInThisRequest = false;

    let evidenceOwner: FileRequestUser | null = null;

    if (evidence) {
      const currentUser: FileRequestUser = {
        id: reporterId,
        role: reporter.role ?? 'user',
      };

      const created = await this.filesService.createFileFromBuffer(
        evidence.buffer,
        evidence.originalName,
        evidence.mimeType,
        currentUser,
        FilePurpose.REPORT_EVIDENCE,
      );

      attachedEvidenceFileId = created.file.id;

      createdEvidenceInThisRequest = true;

      evidenceOwner = currentUser;

      evidenceUrl = await this.tryCreateEvidenceReadUrl(created.file.id);
    } else {
      const normalizedEvidenceFileId = evidenceFileId?.trim() ?? '';

      if (normalizedEvidenceFileId) {
        const confirmedFile = await this.filesService.findActiveFileById(
          normalizedEvidenceFileId,
        );

        if (confirmedFile.filePurpose !== FilePurpose.REPORT_EVIDENCE) {
          throw new BadRequestException(
            'Provided file is not valid report evidence.',
          );
        }

        const normalizedRole = (reporter.role ?? '').trim().toLowerCase();

        const boolIsAdmin = normalizedRole === 'admin';

        if (!boolIsAdmin && confirmedFile.ownerUserId !== reporterId) {
          throw new ForbiddenException(
            'You do not have permission to attach this file as evidence.',
          );
        }

        attachedEvidenceFileId = confirmedFile.id;

        evidenceUrl = await this.tryCreateEvidenceReadUrl(confirmedFile.id);
      }
    }

    const ticketId = `REP-${randomInt(100000, 1000000)}`;

    let transactionResult: {
      savedUserReport: UserReport;
      savedModerationReport: ModerationReport;
    };

    try {
      transactionResult = await this.dataSource.transaction(async (manager) => {
        const userReport = manager.create(UserReport, {
          reporterId,
          reportedUserId: targetUserId,
          reasonId: reason.id,
          description: normalizedDescription || null,
          evidenceFileId: attachedEvidenceFileId,
          clientReportId: normalizedClientReportId || null,
          status: UserReportStatus.PENDING,
          ticketId,
        });

        const savedUserReport = await manager.save(userReport);

        const moderationReport = manager.create(ModerationReport, {
          sourceUserReportId: savedUserReport.id,

          caseNumber: `MOD-${Date.now()}-${randomInt(1000, 10000)}`,

          reporterId: savedUserReport.reporterId,

          subjectId: savedUserReport.reportedUserId,

          contentType: 'user',

          contentEntityId: savedUserReport.reportedUserId,

          reportReason: reason.title,

          reporterNote: savedUserReport.description,

          status: 'pending',

          assignedModeratorId: null,
        });

        const savedModerationReport = await manager.save(moderationReport);

        if (attachedEvidenceFileId) {
          const visualEvidence = manager.create(ReportVisualEvidence, {
            reportId: savedModerationReport.id,

            evidenceFileId: attachedEvidenceFileId,

            mediaUrl: null,

            descriptionText: null,
          });

          await manager.save(visualEvidence);
        }

        return {
          savedUserReport,
          savedModerationReport,
        };
      });
    } catch (error) {
      /*
       * Only clean up files uploaded during
       * this exact request.
       *
       * Do not archive a file supplied through
       * evidenceFileId because it existed before
       * this report request.
       */
      if (
        createdEvidenceInThisRequest &&
        attachedEvidenceFileId &&
        evidenceOwner
      ) {
        try {
          await this.filesService.archiveFile(
            attachedEvidenceFileId,
            evidenceOwner,
          );
        } catch (_) {
          /*
           * Preserve the original database
           * transaction error.
           */
        }
      }

      if (normalizedClientReportId && this.isUniqueViolationError(error)) {
        const existingReport = await this.findExistingReportResponse(
          reporterId,
          normalizedClientReportId,
        );

        if (existingReport) {
          return existingReport;
        }
      }

      throw error;
    }

    return {
      id: transactionResult.savedUserReport.id,

      reporterId: transactionResult.savedUserReport.reporterId,

      reportedUserId: transactionResult.savedUserReport.reportedUserId,

      reason: {
        id: reason.id,
        title: reason.title,
      },

      description: transactionResult.savedUserReport.description,

      evidenceFileId: transactionResult.savedUserReport.evidenceFileId,

      evidenceUrl,

      status: transactionResult.savedUserReport.status,

      ticketId: transactionResult.savedUserReport.ticketId,

      moderationCaseNumber: transactionResult.savedModerationReport.caseNumber,

      createdAt: transactionResult.savedUserReport.createdAt,
    };
  }

  async listActiveReasons() {
    const reasons = await this.reportReasonRepository.find({
      where: {
        isActive: true,
      },
      order: {
        createdAt: 'ASC',
      },
    });

    return reasons.map((reason) => ({
      id: reason.id,
      title: reason.title,
    }));
  }

  async listAllReasons() {
    return this.reportReasonRepository.find({
      order: {
        createdAt: 'ASC',
      },
    });
  }

  async createReason(title: string, isActive = true) {
    const normalizedTitle = title?.trim() ?? '';

    if (!normalizedTitle) {
      throw new BadRequestException('Reason title is required.');
    }

    const existingReason = await this.reportReasonRepository
      .createQueryBuilder('reason')
      .where('LOWER(TRIM(reason.title)) = LOWER(:title)', {
        title: normalizedTitle,
      })
      .getOne();

    if (existingReason) {
      return existingReason;
    }

    const reason = this.reportReasonRepository.create({
      title: normalizedTitle,
      isActive,
    });

    return this.reportReasonRepository.save(reason);
  }

  async updateReason(id: string, title?: string, isActive?: boolean) {
    const reason = await this.reportReasonRepository.findOne({
      where: {
        id,
      },
    });

    if (!reason) {
      throw new NotFoundException('Reason not found.');
    }

    if (title !== undefined) {
      const normalizedTitle = title.trim();

      if (!normalizedTitle) {
        throw new BadRequestException('Reason title cannot be empty.');
      }

      const duplicate = await this.reportReasonRepository
        .createQueryBuilder('otherReason')
        .where('otherReason.id != :id', {
          id: reason.id,
        })
        .andWhere('LOWER(TRIM(otherReason.title)) = LOWER(:title)', {
          title: normalizedTitle,
        })
        .getOne();

      if (duplicate) {
        throw new BadRequestException(
          'Another report reason already uses this title.',
        );
      }

      reason.title = normalizedTitle;
    }

    if (isActive !== undefined) {
      reason.isActive = isActive;
    }

    return this.reportReasonRepository.save(reason);
  }

  private async findExistingReportResponse(
    reporterId: string,
    clientReportId: string,
  ) {
    const existingUserReport = await this.dataSource
      .getRepository(UserReport)
      .findOne({
        where: {
          reporterId,
          clientReportId,
        },
        relations: {
          reason: true,
        },
      });

    if (!existingUserReport) {
      return null;
    }

    const moderationReport = await this.dataSource
      .getRepository(ModerationReport)
      .findOne({
        where: {
          sourceUserReportId: existingUserReport.id,
        },
      });

    const evidenceUrl = existingUserReport.evidenceFileId
      ? await this.tryCreateEvidenceReadUrl(existingUserReport.evidenceFileId)
      : null;

    return {
      id: existingUserReport.id,
      reporterId: existingUserReport.reporterId,
      reportedUserId: existingUserReport.reportedUserId,
      reason: {
        id: existingUserReport.reason.id,
        title: existingUserReport.reason.title,
      },
      description: existingUserReport.description,
      evidenceFileId: existingUserReport.evidenceFileId,
      evidenceUrl,
      status: existingUserReport.status,
      ticketId: existingUserReport.ticketId,
      moderationCaseNumber: moderationReport?.caseNumber ?? null,
      createdAt: existingUserReport.createdAt,
    };
  }

  private isUniqueViolationError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    );
  }

  private async resolveActiveReason(value: string): Promise<ReportReason> {
    const normalizedValue = value.trim();

    const reason = await this.reportReasonRepository
      .createQueryBuilder('reason')
      .where('reason.isActive = :isActive', {
        isActive: true,
      })
      .andWhere(
        `(
        CAST(reason.id AS text) = :value
        OR LOWER(TRIM(reason.title)) = LOWER(:value)
      )`,
        {
          value: normalizedValue,
        },
      )
      .getOne();

    if (!reason) {
      throw new BadRequestException('Invalid reason provided.');
    }

    return reason;
  }

  private async tryCreateEvidenceReadUrl(
    fileId: string,
  ): Promise<string | null> {
    try {
      const result = await this.filesService.createSignedReadUrl(fileId);

      return result.signedReadUrl;
    } catch (_) {
      return null;
    }
  }
}
