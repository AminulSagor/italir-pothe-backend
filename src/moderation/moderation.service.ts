import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ModerationReport } from './entities/moderation-report.entity';
import { ReportVisualEvidence } from './entities/report-visual-evidence.entity';
import { ModerationAction } from './entities/moderation-action.entity';
import { User } from '../users/entities/user.entity';
import { Course } from '../module-2/courses/entities/course.entity';
import { UserCourseEnrollment } from '../module-2/courses/entities/user-course-enrollment.entity';

@Injectable()
export class ModerationService {
  constructor(
    @InjectRepository(ModerationReport)
    private readonly reportRepo: Repository<ModerationReport>,

    @InjectRepository(ReportVisualEvidence)
    private readonly evidenceRepo: Repository<ReportVisualEvidence>,

    @InjectRepository(ModerationAction)
    private readonly actionRepo: Repository<ModerationAction>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>,

    @InjectRepository(UserCourseEnrollment)
    private readonly enrollmentRepo: Repository<UserCourseEnrollment>,

    private readonly dataSource: DataSource,
  ) {}

  async listReports(page = 1, limit = 10, status?: string, reason?: string) {
    const qb = this.reportRepo.createQueryBuilder('r')
      .leftJoinAndSelect('r.subject', 'subject')
      .leftJoinAndSelect('r.reporter', 'reporter')
      .orderBy('r.submittedAt', 'DESC');

    if (status) qb.andWhere('r.status = :status', { status });
    if (reason) qb.andWhere('r.reportReason = :reason', { reason });

    const total = await qb.getCount();

    const items = await qb.skip((page - 1) * limit).take(limit).getMany();

    const rows = items.map((r) => ({
      id: r.id,
      caseNumber: r.caseNumber,
      subjectName: r.subject?.fullName ?? null,
      contentType: r.contentType,
      contentEntityId: r.contentEntityId,
      reportReason: r.reportReason,
      submittedAt: r.submittedAt,
      status: r.status,
    }));

    return { items: rows, meta: { total, page, limit } };
  }

  async getReportByCaseNumber(caseNumber: string) {
    const report = await this.reportRepo.findOne({
      where: { caseNumber },
      relations: ['reporter', 'subject'],
    });

    if (!report) throw new NotFoundException('Report not found');

    const subject = report.subject;

    const subjectCourses = await this.enrollmentRepo.find({
      where: { userId: subject.id },
      relations: ['course'],
    });

    const visualEvidence = await this.evidenceRepo.find({ where: { reportId: report.id } });

    return {
      report_overview: {
        caseNumber: report.caseNumber,
        status: report.status,
        submittedAt: report.submittedAt,
        reportReason: report.reportReason,
      },
      reporter_details: {
        name: report.reporter?.fullName ?? null,
        phone: report.reporter?.phone ?? null,
        email: report.reporter?.email ?? null,
        reporterNote: report.reporterNote ?? null,
      },
      subject_stats: {
        name: subject?.fullName ?? null,
        joinedAt: subject?.joinedAt ?? subject?.createdAt ?? null,
        current_streak_days: subject?.currentStreakDays ?? 0,
        total_xp: subject?.totalXp ?? 0,
        purchase_value_eur: subject?.purchaseValueEur ?? '0.00',
      },
      subject_courses: subjectCourses.map((e) => ({
        title: e.course?.title ?? null,
        status: e.status,
      })),
      visual_evidence: visualEvidence.map((v) => ({ url: v.mediaUrl, description: v.descriptionText })),
    };
  }

  async performAction(reportId: string, payload: { action_type: string; action_reason: string }, moderatorId: string) {
    if (!payload.action_reason || !payload.action_reason.trim()) {
      throw new Error('action_reason is required');
    }

    return this.dataSource.transaction(async (manager) => {
      const report = await manager.findOne(ModerationReport, { where: { id: reportId } });
      if (!report) throw new NotFoundException('Report not found');

      const action = manager.create(ModerationAction, {
        reportId: report.id,
        moderatorId,
        actionType: payload.action_type,
        actionReason: payload.action_reason,
      });

      await manager.save(action);

      let newStatus = 'resolved';
      if (payload.action_type === 'permanent_ban') newStatus = 'banned';
      if (payload.action_type === 'dismiss') newStatus = 'resolved';

      await manager.update(ModerationReport, { id: report.id }, { status: newStatus, assignedModeratorId: moderatorId });

      if (payload.action_type === 'permanent_ban') {
        await manager.update(User, { id: report.subjectId }, { isBanned: true });
      }

      return { ok: true };
    });
  }
}
