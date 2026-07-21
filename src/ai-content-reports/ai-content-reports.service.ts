import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FilePurpose } from 'src/files/entities/file.entity';
import {
  FileRequestUser,
  FilesService,
} from 'src/files/services/files.service';

import { CreateAiContentReportDto } from './dto/create-ai-content-report.dto';
import { ListAiContentReportsDto } from './dto/list-ai-content-reports.dto';
import { UpdateAiContentReportStatusDto } from './dto/update-ai-content-report-status.dto';
import {
  AiContentReport,
  AiContentReportStatus,
} from './entities/ai-content-report.entity';

interface CreateAiContentReportUser {
  id: string;
  role?: string;
}

interface ScreenshotUpload {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

@Injectable()
export class AiContentReportsService {
  constructor(
    @InjectRepository(AiContentReport)
    private readonly reportRepository: Repository<AiContentReport>,

    private readonly filesService: FilesService,
  ) {}

  async createReport(
    currentUser: CreateAiContentReportUser,
    dto: CreateAiContentReportDto,
    screenshot?: ScreenshotUpload | null,
  ) {
    const reporterId = currentUser.id?.trim() ?? '';

    if (!reporterId) {
      throw new BadRequestException('Authenticated reporter is required.');
    }

    const clientReportId = dto.clientReportId?.trim() || null;

    if (clientReportId) {
      const existing = await this.reportRepository.findOne({
        where: {
          reporterId,
          clientReportId,
        },
      });

      if (existing) {
        return this.toResponse(existing);
      }
    }

    const aiContentText = dto.aiContentText?.trim() || null;
    const aiContentUrl = dto.aiContentUrl?.trim() || null;
    const aiContentFileId = dto.aiContentFileId?.trim() || null;

    if (!aiContentText && !aiContentUrl && !aiContentFileId) {
      throw new BadRequestException(
        'Automatic AI content attachment is required. Send aiContentText, aiContentFileId, or aiContentUrl.',
      );
    }

    if (aiContentFileId) {
      const aiContentFile = await this.filesService.findActiveFileById(
        aiContentFileId,
      );

      const normalizedRole = currentUser.role?.trim().toLowerCase() ?? '';
      const isAdmin = normalizedRole === 'admin';

      if (!isAdmin && aiContentFile.ownerUserId !== reporterId) {
        throw new ForbiddenException(
          'You cannot attach an AI output file owned by another user.',
        );
      }
    }

    let screenshotFileId: string | null = null;
    let screenshotOwner: FileRequestUser | null = null;

    if (screenshot) {
      screenshotOwner = {
        id: reporterId,
        role: currentUser.role ?? 'user',
      };

      const createdScreenshot = await this.filesService.createFileFromBuffer(
        screenshot.buffer,
        screenshot.originalName,
        screenshot.mimeType,
        screenshotOwner,
        FilePurpose.REPORT_EVIDENCE,
      );

      screenshotFileId = createdScreenshot.file.id;
    }

    try {
      const report = this.reportRepository.create({
        reporterId,
        featureType: dto.featureType,
        issue: dto.issue,
        details: dto.details?.trim() || null,
        sourceReference: dto.sourceReference?.trim() || null,
        messageReference: dto.messageReference?.trim() || null,
        aiContentText,
        aiContentFileId,
        aiContentUrl,
        screenshotFileId,
        clientReportId,
        status: AiContentReportStatus.PENDING,
        adminNote: null,
        reviewedByAdminId: null,
        reviewedAt: null,
      });

      const saved = await this.reportRepository.save(report);

      return this.toResponse(saved);
    } catch (error) {
      if (screenshotFileId && screenshotOwner) {
        try {
          await this.filesService.archiveFile(
            screenshotFileId,
            screenshotOwner,
          );
        } catch (_) {
          // Preserve the original database error.
        }
      }

      throw error;
    }
  }

  async listForAdmin(query: ListAiContentReportsDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const builder = this.reportRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.reporter', 'reporter')
      .orderBy('report.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      builder.andWhere('report.status = :status', {
        status: query.status,
      });
    }

    if (query.featureType) {
      builder.andWhere('report.featureType = :featureType', {
        featureType: query.featureType,
      });
    }

    const search = query.search?.trim();

    if (search) {
      builder.andWhere(
        `(
          report.issue ILIKE :search
          OR report.details ILIKE :search
          OR report."aiContentText" ILIKE :search
          OR report."sourceReference" ILIKE :search
          OR report."messageReference" ILIKE :search
          OR reporter."fullName" ILIKE :search
          OR reporter.email ILIKE :search
        )`,
        {
          search: `%${search}%`,
        },
      );
    }

    const [items, total] = await builder.getManyAndCount();

    return {
      items: await Promise.all(
        items.map((item) => this.toAdminResponse(item)),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getForAdmin(id: string) {
    const report = await this.reportRepository.findOne({
      where: { id },
      relations: {
        reporter: true,
      },
    });

    if (!report) {
      throw new NotFoundException('AI content report not found.');
    }

    return this.toAdminResponse(report);
  }

  async updateStatus(
    id: string,
    dto: UpdateAiContentReportStatusDto,
    adminId: string,
  ) {
    const report = await this.reportRepository.findOne({
      where: { id },
      relations: {
        reporter: true,
      },
    });

    if (!report) {
      throw new NotFoundException('AI content report not found.');
    }

    report.status = dto.status;
    report.adminNote = dto.adminNote?.trim() || report.adminNote;

    if (dto.status === AiContentReportStatus.PENDING) {
      report.reviewedAt = null;
      report.reviewedByAdminId = null;
    } else {
      report.reviewedAt = new Date();
      report.reviewedByAdminId = adminId;
    }

    const saved = await this.reportRepository.save(report);

    return this.toAdminResponse(saved);
  }

  private async toAdminResponse(report: AiContentReport) {
    const [screenshotUrl, aiContentFileUrl] = await Promise.all([
      this.tryCreateSignedReadUrl(report.screenshotFileId),
      this.tryCreateSignedReadUrl(report.aiContentFileId),
    ]);

    return {
      ...this.toResponse(report),
      reporter: {
        id: report.reporter?.id ?? report.reporterId,
        fullName: report.reporter?.fullName ?? null,
        email: report.reporter?.email ?? null,
        phone: report.reporter?.phone ?? null,
      },
      screenshotUrl,
      aiContentFileUrl,
    };
  }

  private toResponse(report: AiContentReport) {
    return {
      id: report.id,
      reporterId: report.reporterId,
      featureType: report.featureType,
      issue: report.issue,
      details: report.details,
      sourceReference: report.sourceReference,
      messageReference: report.messageReference,
      aiContentText: report.aiContentText,
      aiContentFileId: report.aiContentFileId,
      aiContentUrl: report.aiContentUrl,
      screenshotFileId: report.screenshotFileId,
      clientReportId: report.clientReportId,
      status: report.status,
      adminNote: report.adminNote,
      reviewedByAdminId: report.reviewedByAdminId,
      reviewedAt: report.reviewedAt,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  private async tryCreateSignedReadUrl(fileId: string | null) {
    if (!fileId) {
      return null;
    }

    try {
      const result = await this.filesService.createSignedReadUrl(fileId);

      return result.signedReadUrl;
    } catch (_) {
      return null;
    }
  }
}
