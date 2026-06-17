import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomInt } from 'crypto';

import { UserReport, UserReportStatus } from './entities/user-report.entity';
import { ReportReason } from './entities/report-reason.entity';
import { User } from 'src/users/entities/user.entity';
import { FilesService, FileRequestUser } from 'src/files/services/files.service';

@Injectable()
export class UserReportsService {
  constructor(
    @InjectRepository(UserReport)
    private readonly userReportRepository: Repository<UserReport>,

    @InjectRepository(ReportReason)
    private readonly reportReasonRepository: Repository<ReportReason>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly filesService: FilesService,
  ) {}

  async createReport(
    reporter: { id: string; role?: string },
    reportedUserId: string,
    reasonId: string,
    description?: string | null,
    evidence?: { buffer: Buffer; originalName: string; mimeType: string } | null,
  ) {
    // validate reported user exists
    const reported = await this.userRepository.findOne({ where: { id: reportedUserId } });
    if (!reported) {
      throw new NotFoundException('The user you are trying to report does not exist.');
    }

    // validate reason
    const reason = await this.reportReasonRepository.findOne({ where: { id: reasonId } });
    if (!reason || !reason.isActive) {
      throw new BadRequestException('Invalid reason ID provided.');
    }

    let evidenceFileId: string | null = null;
    let evidenceUrl: string | null = null;

    if (evidence) {
      const currentUser: FileRequestUser = { id: reporter.id, role: reporter.role ?? 'USER' };

      const created = await this.filesService.createFileFromBuffer(
        evidence.buffer,
        evidence.originalName,
        evidence.mimeType,
        currentUser,
      );

      evidenceFileId = created.file.id;
      evidenceUrl = created.publicUrl;
    }

    const ticketId = `REP-${randomInt(100000, 999999)}`;

    const report = this.userReportRepository.create({
      reporterId: reporter.id,
      reportedUserId,
      reasonId: reason.id,
      description: description?.trim() || null,
      evidenceFileId,
      status: UserReportStatus.PENDING,
      ticketId,
    });

    const saved = await this.userReportRepository.save(report);

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
}
