import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Course } from '../module-2/courses/entities/course.entity';
import { UserCourseEnrollment } from '../module-2/courses/entities/user-course-enrollment.entity';
import { FilesService } from 'src/files/services/files.service';
import { NotificationsService } from 'src/notifications/services/notifications.service';
import { ChatGateway } from 'src/chat/chat.gateway';
import { CallRealtimeService } from 'src/calls/services/call-realtime.service';
import {
  NotificationPriority,
  NotificationType,
} from 'src/notifications/entities/notification-event.entity';
import {
  UserReport,
  UserReportStatus,
} from 'src/user-reports/entities/user-report.entity';
import { ModerationReport } from 'src/moderation/entities/moderation-report.entity';
import { ReportVisualEvidence } from 'src/moderation/entities/report-visual-evidence.entity';
import { ModerationAction } from 'src/moderation/entities/moderation-action.entity';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

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
    private readonly notificationsService: NotificationsService,
    private readonly chatGateway: ChatGateway,
    private readonly callRealtimeService: CallRealtimeService,
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
    const normalizedStatus = status?.trim().toLowerCase();
    const allowedStatuses = ['pending', 'processing', 'resolved', 'banned'];

    if (normalizedStatus && !allowedStatuses.includes(normalizedStatus)) {
      throw new BadRequestException(
        'status must be pending, processing, resolved, or banned',
      );
    }

    const qb = this.reportRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.subject', 'subject')
      .leftJoinAndSelect('r.reporter', 'reporter')
      .orderBy('r.submittedAt', 'DESC');

    if (normalizedStatus) {
      qb.andWhere('r.status = :status', { status: normalizedStatus });
    }
    if (reason?.trim()) {
      qb.andWhere('r.reportReason = :reason', { reason: reason.trim() });
    }
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

    const requestedActionType = payload.action_type?.trim() ?? '';
    const actionType =
      requestedActionType === 'warn' ? 'formal_warning' : requestedActionType;
    const allowedActionTypes = ['formal_warning', 'permanent_ban', 'dismiss'];

    if (!allowedActionTypes.includes(actionType)) {
      throw new BadRequestException(
        'action_type must be formal_warning, permanent_ban, or dismiss',
      );
    }

    const actionReason = payload.action_reason.trim();

    if (actionReason.length > 1000) {
      throw new BadRequestException(
        'action_reason must not exceed 1000 characters',
      );
    }

    const transactionResult = await this.dataSource.transaction(
      async (manager) => {
        const report = await manager.findOne(ModerationReport, {
          where: { id: reportId },
        });
        if (!report) {
          throw new NotFoundException('Report not found');
        }

        if (report.status === 'resolved' || report.status === 'banned') {
          throw new BadRequestException(
            'This moderation report already has a final decision.',
          );
        }

        const action = manager.create(ModerationAction, {
          reportId: report.id,
          moderatorId,
          actionType,
          actionReason,
        });

        await manager.save(action);

        const newStatus =
          actionType === 'permanent_ban' ? 'banned' : 'resolved';

        await manager.update(
          ModerationReport,
          { id: report.id },
          {
            status: newStatus,
            assignedModeratorId: moderatorId,
          },
        );

        /*
         * Keep the original mobile report synchronized with the admin case.
         * UserReportStatus has no banned state, so each completed decision is
         * stored as RESOLVED in the mobile report table.
         */
        if (report.sourceUserReportId) {
          await manager.update(
            UserReport,
            { id: report.sourceUserReportId },
            { status: UserReportStatus.RESOLVED },
          );
        }

        if (actionType === 'permanent_ban') {
          await manager.update(
            User,
            { id: report.subjectId },
            { isBanned: true },
          );
        }

        return {
          response: {
            ok: true,
            reportId: report.id,
            caseNumber: report.caseNumber,
            status: newStatus,
          },
          report,
          action,
        };
      },
    );

    if (actionType === 'permanent_ban') {
      this.disconnectRestrictedUser({
        userId: transactionResult.report.subjectId,
        reason: actionReason,
        effectiveAt: transactionResult.action.loggedAt,
        caseNumber: transactionResult.report.caseNumber,
      });
    }

    const notification = await this.sendDecisionNotification({
      actionType,
      actionReason,
      moderatorId,
      report: transactionResult.report,
      effectiveAt: transactionResult.action.loggedAt,
    });

    return {
      ...transactionResult.response,
      notification,
    };
  }

  private disconnectRestrictedUser(params: {
    userId: string;
    reason: string;
    effectiveAt: Date;
    caseNumber: string;
  }): void {
    const payload = {
      code: 'ACCOUNT_BANNED',
      reason: params.reason.slice(0, 120),
      effectiveAt: params.effectiveAt.toISOString(),
      caseNumber: params.caseNumber,
    };

    try {
      this.chatGateway.disconnectUserForModeration(params.userId, payload);
      this.callRealtimeService.disconnectUserForModeration(
        params.userId,
        payload,
      );
    } catch (error) {
      this.logger.error(
        `Failed to disconnect realtime sessions for user ${params.userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async sendDecisionNotification(params: {
    actionType: string;
    actionReason: string;
    moderatorId: string;
    report: ModerationReport;
    effectiveAt: Date;
  }): Promise<{
    created: boolean;
    totalDevices: number;
    sentCount: number;
    failedCount: number;
  }> {
    const { actionType, actionReason, moderatorId, report, effectiveAt } =
      params;

    let userId: string;
    let title: string;
    let body: string;
    let priority = NotificationPriority.NORMAL;
    let deepLink: string | undefined;

    if (actionType === 'formal_warning') {
      userId = report.subjectId;
      title = 'Formal warning from Italir Pothe';
      body = this.buildNotificationBody(
        'A formal warning has been issued for your account.',
        actionReason,
      );
      priority = NotificationPriority.HIGH;
    } else if (actionType === 'permanent_ban') {
      userId = report.subjectId;
      title = 'Account permanently restricted';
      body = this.buildNotificationBody(
        'Your Italir Pothe account has been permanently restricted.',
        actionReason,
      );
      priority = NotificationPriority.HIGH;
      deepLink = this.buildAccountSuspendedDeepLink({
        reason: actionReason,
        effectiveAt,
        caseNumber: report.caseNumber,
      });
    } else {
      userId = report.reporterId;
      title = 'Report reviewed';
      body = this.buildNotificationBody(
        `Your report ${report.caseNumber} has been reviewed and dismissed.`,
        actionReason,
      );
    }

    try {
      const result = await this.notificationsService.sendToUser(
        {
          userId,
          type: NotificationType.SYSTEM,
          title,
          body,
          priority,
          deepLink,
        },
        moderatorId,
      );

      return {
        created: true,
        totalDevices: result.totalDevices,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
      };
    } catch (error) {
      /*
       * A moderation decision must remain committed even if Firebase or the
       * notification service is temporarily unavailable.
       */
      this.logger.error(
        `Moderation action was saved, but the notification failed for report ${report.caseNumber}`,
        error instanceof Error ? error.stack : String(error),
      );

      return {
        created: false,
        totalDevices: 0,
        sentCount: 0,
        failedCount: 0,
      };
    }
  }

  private buildAccountSuspendedDeepLink(params: {
    reason: string;
    effectiveAt: Date;
    caseNumber: string;
  }): string {
    const buildLink = (reason: string) => {
      const query = new URLSearchParams({
        reason,
        effectiveAt: params.effectiveAt.toISOString(),
        caseNumber: params.caseNumber,
      });

      return `italirpothe://account-suspended?${query.toString()}`;
    };

    const normalizedReason = params.reason.trim();
    const completeLink = buildLink(normalizedReason);

    if (completeLink.length <= 500) {
      return completeLink;
    }

    /*
     * notification_events.deepLink is varchar(500). URL encoding can expand
     * Unicode text substantially, so determine the longest safe prefix using
     * the final encoded link length instead of a fixed character count.
     */
    let lowerBound = 0;
    let upperBound = normalizedReason.length;

    while (lowerBound < upperBound) {
      const midpoint = Math.ceil((lowerBound + upperBound) / 2);
      const candidate = buildLink(normalizedReason.slice(0, midpoint));

      if (candidate.length <= 500) {
        lowerBound = midpoint;
      } else {
        upperBound = midpoint - 1;
      }
    }

    return buildLink(normalizedReason.slice(0, lowerBound));
  }

  private buildNotificationBody(prefix: string, reason: string): string {
    const value = `${prefix} Reason: ${reason}`.trim();
    return value.length <= 500 ? value : `${value.slice(0, 497)}...`;
  }
}
