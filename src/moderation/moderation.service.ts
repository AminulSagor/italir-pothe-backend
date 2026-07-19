import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ModerationReport } from './entities/moderation-report.entity';
import { ReportVisualEvidence } from './entities/report-visual-evidence.entity';
import { ModerationAction } from './entities/moderation-action.entity';
import { User } from '../users/entities/user.entity';
import { Course } from '../module-2/courses/entities/course.entity';
import { UserCourseEnrollment } from '../module-2/courses/entities/user-course-enrollment.entity';
import { FilesService } from 'src/files/services/files.service';
import {
  UserReport,
  UserReportStatus,
} from 'src/user-reports/entities/user-report.entity';

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
    private readonly filesService: FilesService,
  ) {}

  private percentageChange(current: number, previous: number) {
    if (previous === 0) return current > 0 ? 100 : 0;

    return Math.round(((current - previous) / previous) * 100);
  }

  private startOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private daysAgo(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  async getDashboardMetrics() {
    const todayStart = this.startOfToday();
    const currentWeekStart = this.daysAgo(7);
    const previousWeekStart = this.daysAgo(14);

    const [
      totalReports,
      pendingCount,
      processingCount,
      resolvedCount,
      bannedCount,
      currentWeekPendingCount,
      previousWeekPendingCount,
      resolvedTodayCount,
      resolvedYesterdayCount,
      reasonCounts,
    ] = await Promise.all([
      this.reportRepo.count(),
      this.reportRepo.count({ where: { status: 'pending' } }),
      this.reportRepo.count({ where: { status: 'processing' } }),
      this.reportRepo.count({ where: { status: 'resolved' } }),
      this.reportRepo.count({ where: { status: 'banned' } }),
      this.reportRepo
        .createQueryBuilder('report')
        .where('report.status = :status', { status: 'pending' })
        .andWhere('report.submittedAt >= :currentWeekStart', {
          currentWeekStart,
        })
        .getCount(),
      this.reportRepo
        .createQueryBuilder('report')
        .where('report.status = :status', { status: 'pending' })
        .andWhere('report.submittedAt >= :previousWeekStart', {
          previousWeekStart,
        })
        .andWhere('report.submittedAt < :currentWeekStart', {
          currentWeekStart,
        })
        .getCount(),
      this.actionRepo
        .createQueryBuilder('action')
        .where('action.loggedAt >= :todayStart', { todayStart })
        .getCount(),
      this.actionRepo
        .createQueryBuilder('action')
        .where('action.loggedAt >= :yesterdayStart', {
          yesterdayStart: this.daysAgo(1),
        })
        .andWhere('action.loggedAt < :todayStart', { todayStart })
        .getCount(),
      this.reportRepo
        .createQueryBuilder('report')
        .select('report.reportReason', 'reason')
        .addSelect('COUNT(report.id)', 'count')
        .groupBy('report.reportReason')
        .orderBy('COUNT(report.id)', 'DESC')
        .getRawMany<{ reason: string; count: string }>(),
    ]);

    const avgResponseResult = await this.actionRepo
      .createQueryBuilder('action')
      .innerJoin('action.report', 'report')
      .select(
        'AVG(EXTRACT(EPOCH FROM (action.loggedAt - report.submittedAt)) / 60)',
        'avg',
      )
      .getRawOne<{ avg: string | null }>();

    const avgResponseTimeMinutes = avgResponseResult?.avg
      ? Math.round(Number(avgResponseResult.avg))
      : null;

    return {
      total_report_count: totalReports,
      total_pending_count: pendingCount,
      pending_percentage_change: this.percentageChange(
        currentWeekPendingCount,
        previousWeekPendingCount,
      ),
      avg_response_time_minutes: avgResponseTimeMinutes,
      response_time_percentage_change: 0,
      resolved_today_count: resolvedTodayCount,
      resolved_today_percentage_change: this.percentageChange(
        resolvedTodayCount,
        resolvedYesterdayCount,
      ),
      status_counts: {
        pending: pendingCount,
        processing: processingCount,
        resolved: resolvedCount,
        banned: bannedCount,
      },
      reason_counts: reasonCounts.map((item) => ({
        reason: item.reason,
        count: Number(item.count),
      })),
    };
  }

  async listReports(
    page = 1,
    limit = 10,
    status?: string,
    reason?: string,
    search?: string,
  ) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const qb = this.reportRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.subject', 'subject')
      .leftJoinAndSelect('r.reporter', 'reporter')
      .orderBy('r.submittedAt', 'DESC');

    if (status) qb.andWhere('r.status = :status', { status });
    if (reason) qb.andWhere('r.reportReason = :reason', { reason });
    if (search?.trim()) {
      const normalizedSearch = `%${search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(r.caseNumber) LIKE :search OR LOWER(subject.fullName) LIKE :search OR LOWER(reporter.fullName) LIKE :search OR LOWER(r.contentEntityId) LIKE :search)',
        { search: normalizedSearch },
      );
    }

    const total = await qb.getCount();

    const items = await qb
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getMany();

    const rows = items.map((r) => ({
      id: r.id,
      caseNumber: r.caseNumber,
      subjectName: r.subject?.fullName ?? null,
      subjectAvatarUrl: r.subject?.avatarUrl ?? null,
      reporterName: r.reporter?.fullName ?? null,
      contentType: r.contentType,
      contentEntityId: r.contentEntityId,
      reportReason: r.reportReason,
      submittedAt: r.submittedAt,
      status: r.status,
    }));

    return { items: rows, meta: { total, page: safePage, limit: safeLimit } };
  }

  async getReportByCaseNumber(caseNumber: string) {
    const report = await this.reportRepo.findOne({
      where: {
        caseNumber,
      },
      relations: {
        reporter: true,
        subject: true,
      },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    /*
     * Do not use report.subject.id here.
     *
     * report.subject can be null after the user account is deleted,
     * but report.subjectId remains stored for audits and analytics.
     */
    const [subjectCourses, visualEvidence, actionHistory] = await Promise.all([
      this.enrollmentRepo.find({
        where: {
          userId: report.subjectId,
        },
        relations: {
          course: true,
        },
      }),

      this.evidenceRepo.find({
        where: {
          reportId: report.id,
        },
      }),

      this.actionRepo.find({
        where: { reportId: report.id },
        relations: ['moderator'],
        order: { loggedAt: 'DESC' },
      }),
    ]);

    const reporter = report.reporter;
    const subject = report.subject;

    const mappedVisualEvidence = await Promise.all(
      visualEvidence.map(async (evidence) => {
        let evidenceUrl = evidence.mediaUrl;

        if (evidence.evidenceFileId) {
          try {
            const signedRead = await this.filesService.createSignedReadUrl(
              evidence.evidenceFileId,
            );

            evidenceUrl = signedRead.signedReadUrl;
          } catch (_) {
            evidenceUrl = evidence.mediaUrl;
          }
        }

        return {
          id: evidence.id,
          fileId: evidence.evidenceFileId,
          url: evidenceUrl,
          description: evidence.descriptionText,
          uploadedAt: evidence.uploadedAt,
        };
      }),
    );

    return {
      report_overview: {
        id: report.id,
        caseNumber: report.caseNumber,
        status: report.status,
        submittedAt: report.submittedAt,
        reportReason: report.reportReason,
        contentType: report.contentType,
        contentEntityId: report.contentEntityId,
      },

      reporter_details: {
        id: report.reporterId,
        name: report.reporter?.fullName ?? null,
        phone: report.reporter?.phone ?? null,
        email: report.reporter?.email ?? null,
        avatarUrl: report.reporter?.avatarUrl ?? null,
        reporterNote: report.reporterNote ?? null,

        isDeleted: reporter === null,
      },

      subject_stats: {
        id: subject?.id ?? null,
        name: subject?.fullName ?? null,
        email: subject?.email ?? null,
        phone: subject?.phone ?? null,
        avatarUrl: subject?.avatarUrl ?? null,
        is_banned: subject?.isBanned ?? false,
        joinedAt: subject?.joinedAt ?? subject?.createdAt ?? null,

        current_streak_days: subject?.currentStreakDays ?? 0,

        total_xp: subject?.totalXp ?? 0,

        purchase_value_eur: subject?.purchaseValueEur ?? '0.00',

        isDeleted: subject === null,
      },

      subject_courses: subjectCourses.map((enrollment) => ({
        courseId: enrollment.courseId,

        title: enrollment.course?.title ?? null,

        status: enrollment.status,
      })),

      visual_evidence: mappedVisualEvidence,
      action_history: actionHistory.map((action) => ({
        id: action.id,
        actionType: action.actionType,
        actionReason: action.actionReason,
        moderatorName: action.moderator?.fullName ?? null,
        loggedAt: action.loggedAt,
      })),
    };
  }

  async performAction(
    reportId: string,
    payload: { action_type: string; action_reason: string },
    moderatorId: string,
  ) {
    if (!payload.action_reason || !payload.action_reason.trim()) {
      throw new BadRequestException('action_reason is required');
    }

    const actionType = payload.action_type?.trim() ?? '';
    const allowedActionTypes = [
      'formal_warning',
      'warn',
      'permanent_ban',
      'dismiss',
    ];

    if (!allowedActionTypes.includes(actionType)) {
      throw new BadRequestException(
        'action_type must be formal_warning, permanent_ban, or dismiss',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const report = await manager.findOne(ModerationReport, {
        where: { id: reportId },
      });
      if (!report) throw new NotFoundException('Report not found');

      const action = manager.create(ModerationAction, {
        reportId: report.id,
        moderatorId,
        actionType,
        actionReason: payload.action_reason.trim(),
      });

      await manager.save(action);

      let newStatus = 'resolved';
      if (actionType === 'permanent_ban') newStatus = 'banned';
      if (actionType === 'dismiss') newStatus = 'resolved';

      await manager.update(
        ModerationReport,
        { id: report.id },
        {
          status: newStatus,
          assignedModeratorId: moderatorId,
        },
      );

      /*
       * Keep the original mobile report synchronized
       * with the admin moderation case.
       *
       * UserReportStatus has no "banned" status, so all
       * completed moderation decisions become RESOLVED.
       */
      if (report.sourceUserReportId) {
        await manager.update(
          UserReport,
          {
            id: report.sourceUserReportId,
          },
          {
            status: UserReportStatus.RESOLVED,
          },
        );
      }

      if (actionType === 'permanent_ban') {
        await manager.update(
          User,
          {
            id: report.subjectId,
          },
          {
            isBanned: true,
          },
        );
      }

      return {
        ok: true,
        reportId: report.id,
        caseNumber: report.caseNumber,
        status: newStatus,
      };
    });
  }
}
