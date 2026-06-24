import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomInt } from 'crypto';

import { UserReport, UserReportStatus } from './entities/user-report.entity';
import { ReportReason } from './entities/report-reason.entity';
import { User } from 'src/users/entities/user.entity';
import { ModerationReport } from 'src/moderation/entities/moderation-report.entity';
import { FilesService, FileRequestUser } from 'src/files/services/files.service';
import { FilePurpose } from 'src/files/entities/file.entity';

@Injectable()
export class UserReportsService {
  constructor(
    @InjectRepository(UserReport)
    private readonly userReportRepository: Repository<UserReport>,

    @InjectRepository(ReportReason)
    private readonly reportReasonRepository: Repository<ReportReason>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(ModerationReport)
    private readonly moderationReportRepository: Repository<ModerationReport>,

    private readonly filesService: FilesService,
  ) {}

  async createReport(
    reporter: { id: string; role?: string },
    reportedUserId: string,
    reasonId: string,
    description?: string | null,
    evidenceFileId?: string | null,
    evidence?: { buffer: Buffer; originalName: string; mimeType: string } | null,
  ) {
    // validate reported user exists
    const reported = await this.userRepository.findOne({ where: { id: reportedUserId } });
    if (!reported) {
      throw new NotFoundException('The user you are trying to report does not exist.');
    }

    // validate reason
    const isUuid = (v: string) =>
      typeof v === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);

    let reason: ReportReason | null = null;
    if (isUuid(reasonId)) {
      // frontend provided the actual UUID
      reason = await this.reportReasonRepository.findOne({ where: { id: reasonId } });
    } else if (typeof reasonId === 'string') {
      // frontend likely provided a key/slug/title like 'harassment' — try case-insensitive title match
      reason = await this.reportReasonRepository
        .createQueryBuilder('r')
        .where('LOWER(r.title) = LOWER(:title)', { title: reasonId })
        .getOne();
    }

    if (!reason || !reason.isActive) {
      throw new BadRequestException('Invalid reason provided.');
    }

    let attachedEvidenceFileId: string | null = null;
    let evidenceUrl: string | null = null;

    if (evidence) {
      // Direct buffer upload (multipart) — create file record immediately
      const currentUser: FileRequestUser = { id: reporter.id, role: reporter.role ?? 'USER' };

      const created = await this.filesService.createFileFromBuffer(
        evidence.buffer,
        evidence.originalName,
        evidence.mimeType,
        currentUser,
      );

      attachedEvidenceFileId = created.file.id;
      evidenceUrl = created.publicUrl;
    } else if (evidenceFileId) {
      // Two-step flow: client already uploaded and confirmed the file — validate ownership and purpose
      const confirmedFile = await this.filesService.findActiveFileById(evidenceFileId);

      if (!confirmedFile) {
        throw new BadRequestException('Provided evidenceFileId does not reference an existing uploaded file');
      }

      if (confirmedFile.filePurpose !== FilePurpose.REPORT_EVIDENCE) {
        throw new BadRequestException('Provided file is not valid report evidence');
      }

      // if reporter is not admin, ensure they own the file
      if ((reporter.role ?? '').toLowerCase() !== 'admin') {
        if (!confirmedFile.ownerUserId || confirmedFile.ownerUserId !== reporter.id) {
          throw new ForbiddenException('You do not have permission to attach this file as evidence');
        }
      }

      attachedEvidenceFileId = confirmedFile.id;

      // derive public URL via files service helper
      try {
        const read = await this.filesService.createSignedReadUrl(confirmedFile.id);
        evidenceUrl = read.file?.publicUrl ?? null;
      } catch (err) {
        evidenceUrl = null;
      }
    }

    const ticketId = `REP-${randomInt(100000, 999999)}`;

    const report = this.userReportRepository.create({
      reporterId: reporter.id,
      reportedUserId,
      reasonId: reason.id,
      description: description?.trim() || null,
      evidenceFileId: attachedEvidenceFileId,
      status: UserReportStatus.PENDING,
      ticketId,
    });

    const saved = await this.userReportRepository.save(report);

    // create corresponding moderation report so admin API can surface it
    try {
      const caseNumber = `MOD-${Date.now()}-${randomInt(1000, 9999)}`;
      const mod = this.moderationReportRepository.create({
        caseNumber,
        reporterId: saved.reporterId,
        subjectId: saved.reportedUserId,
        contentType: 'user',
        contentEntityId: saved.reportedUserId,
        reportReason: reason.title,
        reporterNote: saved.description,
        status: 'pending',
      });

      await this.moderationReportRepository.save(mod);
    } catch (err) {
      // don't block report creation if moderation mirror fails
      // eslint-disable-next-line no-console
      console.warn('Failed to create moderation report mirror:', err?.message ?? err);
    }

    return {
      id: saved.id,
      reporterId: saved.reporterId,
      reportedUserId: saved.reportedUserId,
      reason: { id: reason.id, title: reason.title },
      description: saved.description,
      evidenceFileId: saved.evidenceFileId,
      evidenceUrl,
      status: saved.status,
      ticketId: saved.ticketId,
      createdAt: saved.createdAt,
    };
  }

  async listActiveReasons() {
    const reasons = await this.reportReasonRepository.find({ where: { isActive: true } });
    return reasons.map((r) => ({ id: r.id, title: r.title }));
  }

  // Admin helpers
  async listAllReasons() {
    return this.reportReasonRepository.find({ order: { createdAt: 'ASC' } });
  }

  async createReason(title: string, isActive = true) {
    const exists = await this.reportReasonRepository.findOne({ where: { title } });
    if (exists) return exists;
    const reason = this.reportReasonRepository.create({ title, isActive });
    return this.reportReasonRepository.save(reason);
  }

  async updateReason(id: string, title?: string, isActive?: boolean) {
    const reason = await this.reportReasonRepository.findOne({ where: { id } });
    if (!reason) throw new NotFoundException('Reason not found');
    if (title) reason.title = title;
    if (isActive !== undefined) reason.isActive = isActive;
    return this.reportReasonRepository.save(reason);
  }
}
