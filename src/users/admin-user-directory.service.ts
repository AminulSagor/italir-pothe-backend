import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  In,
  LessThan,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import { FileVisibility } from 'src/files/entities/file.entity';
import { FilesService } from 'src/files/services/files.service';
import { S3Service } from 'src/files/services/s3.service';
import { CourseEnrollment } from 'src/module-2/course-commerce/entities/course-enrollment.entity';
import {
  CourseEnrollmentStatus,
  CoursePurchaseStatus,
} from 'src/module-2/course-commerce/types/course-commerce.type';
import { UserCourseEnrollment } from 'src/module-2/courses/entities/user-course-enrollment.entity';
import { ExamAttempt } from 'src/module-2/final-exam/entities/exam-attempt.entity';
import { ExamAttemptStatus } from 'src/module-2/final-exam/types/final-exam.type';
import { LeaderboardProfile } from 'src/module-2/leaderboard/entities/leaderboard-profile.entity';
import { UserLearningActivityTimeEntry } from 'src/module-2/learning-activity/entities/user-learning-activity-time-entry.entity';
import { LearningActivityService } from 'src/module-2/learning-activity/services/learning-activity.service';
import { UserCourseProgress } from 'src/module-2/progress/entities/user-course-progress.entity';
import { UserStreak } from 'src/module-2/scoring/entities/user-streak.entity';

import {
  AdminUserActivityQueryDto,
  AdminUserCoursesQueryDto,
  AdminUserDirectoryQueryDto,
  AdminUserExamResultsQueryDto,
  AdminUserGrowthQueryDto,
  QuickRestrictUserDto,
  UpdateAdminUserRestrictionDto,
} from './dto/admin-user-directory.dto';
import { User, UserRole } from './entities/user.entity';
import {
  AdminUserAccessFilter,
  AdminUserAccessTier,
  AdminUserAccountStatusFilter,
  AdminUserActivityAnalyticsResponse,
  AdminUserCourseItem,
  AdminUserCourseSortBy,
  AdminUserCoursesResponse,
  AdminUserDashboardResponse,
  AdminUserDetailsResponse,
  AdminUserDirectoryResponse,
  AdminUserDirectorySortBy,
  AdminUserExamResultsResponse,
  AdminUserExamSortBy,
  AdminUserGrowthPoint,
  AdminUserGrowthRange,
  AdminUserGrowthResponse,
  AdminUserSortOrder,
} from './types/admin-user-directory.type';

interface GrowthBucketConfiguration {
  range: AdminUserGrowthRange;
  sqlUnit: 'hour' | 'day' | 'month';
  periodStart: Date;
  periodEnd: Date;
  buckets: Date[];
}

interface RawDirectoryRow {
  access_tier?: AdminUserAccessTier;
  resolved_total_xp?: string | number | null;
  last_activity_at?: Date | string | null;
  resolved_joined_at?: Date | string | null;
}

@Injectable()
export class AdminUserDirectoryService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(UserLearningActivityTimeEntry)
    private readonly activityRepository: Repository<UserLearningActivityTimeEntry>,

    @InjectRepository(LeaderboardProfile)
    private readonly leaderboardProfileRepository: Repository<LeaderboardProfile>,

    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,

    @InjectRepository(ExamAttempt)
    private readonly examAttemptRepository: Repository<ExamAttempt>,

    @InjectRepository(CourseEnrollment)
    private readonly courseEnrollmentRepository: Repository<CourseEnrollment>,

    @InjectRepository(UserCourseEnrollment)
    private readonly legacyEnrollmentRepository: Repository<UserCourseEnrollment>,

    @InjectRepository(UserCourseProgress)
    private readonly courseProgressRepository: Repository<UserCourseProgress>,

    private readonly filesService: FilesService,
    private readonly s3Service: S3Service,
    private readonly learningActivityService: LearningActivityService,
  ) {}

  async getDashboard(): Promise<AdminUserDashboardResponse> {
    const now = new Date();

    const startOfToday = this.startOfUtcDay(now);
    const startOfYesterday = this.addDays(startOfToday, -1);

    const elapsedTodayMs = now.getTime() - startOfToday.getTime();

    const previousDayComparisonEnd = new Date(
      Math.min(
        startOfToday.getTime(),
        startOfYesterday.getTime() + elapsedTodayMs,
      ),
    );

    const startOfMonth = this.startOfUtcMonth(now);
    const startOfPreviousMonth = this.addMonths(startOfMonth, -1);

    const elapsedMonthMs = now.getTime() - startOfMonth.getTime();

    const previousMonthComparisonEnd = new Date(
      Math.min(
        startOfMonth.getTime(),
        startOfPreviousMonth.getTime() + elapsedMonthMs,
      ),
    );

    const [
      totalUsers,
      usersBeforeCurrentMonth,
      activeCurrentMonth,
      activePreviousMonth,
      premiumProUsers,
      signupsToday,
      signupsYesterday,
    ] = await Promise.all([
      this.userRepository.count({
        where: {
          role: UserRole.USER,
        },
      }),

      this.userRepository.count({
        where: {
          role: UserRole.USER,
          createdAt: LessThan(startOfMonth),
        },
      }),

      this.countActiveUsersBetween(startOfMonth, now),

      this.countActiveUsersBetween(
        startOfPreviousMonth,
        previousMonthComparisonEnd,
      ),

      this.countPremiumProUsers(),

      this.countUsersCreatedBetween(startOfToday, now),

      this.countUsersCreatedBetween(startOfYesterday, previousDayComparisonEnd),
    ]);

    const usersCreatedThisMonth = Math.max(
      0,
      totalUsers - usersBeforeCurrentMonth,
    );

    return {
      totalUsers: {
        value: totalUsers,

        changePercent: this.calculatePercentChange(
          usersCreatedThisMonth,
          usersBeforeCurrentMonth,
        ),

        comparisonPeriod: 'previous total before current UTC month',
      },

      activeThisMonth: {
        value: activeCurrentMonth,

        changePercent: this.calculatePercentDifference(
          activeCurrentMonth,
          activePreviousMonth,
        ),

        comparisonPeriod: 'previous UTC month-to-date period',
      },

      premiumProUsers: {
        count: premiumProUsers,

        percentage:
          totalUsers > 0
            ? Number(((premiumProUsers / totalUsers) * 100).toFixed(2))
            : 0,
      },

      newSignupsToday: {
        value: signupsToday,

        changePercent: this.calculatePercentDifference(
          signupsToday,
          signupsYesterday,
        ),

        comparisonPeriod: 'previous UTC day at the same elapsed time',
      },

      generatedAt: now.toISOString(),

      timezone: 'UTC',
    };
  }

  async getGrowth(
    query: AdminUserGrowthQueryDto,
  ): Promise<AdminUserGrowthResponse> {
    const configuration = this.getGrowthBucketConfiguration(
      query.range ?? AdminUserGrowthRange.MONTH,
    );

    const rows = await this.userRepository
      .createQueryBuilder('user')
      .select(
        `DATE_TRUNC('${configuration.sqlUnit}', user.createdAt)`,
        'bucketStart',
      )
      .addSelect('COUNT(user.id)', 'newUsers')
      .where('user.role = :role', {
        role: UserRole.USER,
      })
      .andWhere('user.createdAt >= :periodStart', {
        periodStart: configuration.periodStart,
      })
      .andWhere('user.createdAt < :periodEnd', {
        periodEnd: configuration.periodEnd,
      })
      .groupBy(`DATE_TRUNC('${configuration.sqlUnit}', user.createdAt)`)
      .orderBy(`DATE_TRUNC('${configuration.sqlUnit}', user.createdAt)`, 'ASC')
      .getRawMany<{
        bucketStart: Date | string;
        newUsers: string;
      }>();

    const usersBeforePeriod = await this.userRepository.count({
      where: {
        role: UserRole.USER,
        createdAt: LessThan(configuration.periodStart),
      },
    });

    const newUsersByBucket = new Map<string, number>(
      rows.map((row) => [
        this.toBucketKey(new Date(row.bucketStart), configuration.sqlUnit),
        Number(row.newUsers) || 0,
      ]),
    );

    let cumulativeUsers = usersBeforePeriod;

    const points: AdminUserGrowthPoint[] = configuration.buckets.map(
      (bucketStart) => {
        const bucketEnd = this.addGrowthBucket(
          bucketStart,
          configuration.sqlUnit,
          1,
        );

        const newUsers =
          newUsersByBucket.get(
            this.toBucketKey(bucketStart, configuration.sqlUnit),
          ) ?? 0;

        cumulativeUsers += newUsers;

        return {
          bucketStart: bucketStart.toISOString(),
          bucketEnd: bucketEnd.toISOString(),

          label: this.formatGrowthLabel(bucketStart, configuration.range),

          newUsers,
          totalUsers: cumulativeUsers,
        };
      },
    );

    return {
      range: configuration.range,
      periodStart: configuration.periodStart.toISOString(),
      periodEnd: configuration.periodEnd.toISOString(),
      usersBeforePeriod,

      newUsers: points.reduce((total, point) => total + point.newUsers, 0),

      totalUsersAtEnd: cumulativeUsers,
      points,
      timezone: 'UTC',
    };
  }

  async findUsers(
    query: AdminUserDirectoryQueryDto,
  ): Promise<AdminUserDirectoryResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const accessTier = query.accessTier ?? AdminUserAccessFilter.ALL;

    const accountStatus =
      query.accountStatus ?? AdminUserAccountStatusFilter.ALL;

    const sortBy = query.sortBy ?? AdminUserDirectorySortBy.JOINED_AT;

    const sortOrder = query.sortOrder ?? AdminUserSortOrder.DESC;

    const search = query.search?.trim() || null;

    const userAlias = 'appUser';

    const premiumAccessExists =
      this.buildPremiumAccessExistsExpression(userAlias);

    const totalXpExpression = `
    GREATEST(
      COALESCE("leaderboard"."totalXp", 0),
      COALESCE("${userAlias}"."totalXp", 0)
    )
  `;

    const joinedAtExpression = `
    COALESCE(
      "${userAlias}"."joinedAt",
      "${userAlias}"."createdAt"
    )
  `;

    const lastActivityExpression = `
    (
      SELECT MAX(activity."startedAt")
      FROM "user_learning_activity_time_entries" activity
      WHERE activity."userId" = "${userAlias}"."id"
    )
  `;

    const accessTierExpression = `
    CASE
      WHEN ${premiumAccessExists}
        THEN '${AdminUserAccessTier.PREMIUM_PRO}'
      ELSE '${AdminUserAccessTier.FREE}'
    END
  `;

    const queryBuilder = this.userRepository
      .createQueryBuilder(userAlias)
      .leftJoin(
        LeaderboardProfile,
        'leaderboard',
        'leaderboard.userId = appUser.id',
      )
      .addSelect(accessTierExpression, 'access_tier')
      .addSelect(totalXpExpression, 'resolved_total_xp')
      .addSelect(joinedAtExpression, 'resolved_joined_at')
      .addSelect(lastActivityExpression, 'last_activity_at')
      .where('appUser.role = :role', {
        role: UserRole.USER,
      })
      .setParameters({
        paidStatus: CoursePurchaseStatus.PAID,
        activeEnrollmentStatus: CourseEnrollmentStatus.ACTIVE,
      });

    if (search) {
      queryBuilder.andWhere(
        new Brackets((where) => {
          where
            .where('LOWER(appUser.fullName) LIKE :search')
            .orWhere(`LOWER(COALESCE(appUser.email, '')) LIKE :search`)
            .orWhere(`LOWER(COALESCE(appUser.phone, '')) LIKE :search`);
        }),
        {
          search: `%${search.toLowerCase()}%`,
        },
      );
    }

    if (accessTier === AdminUserAccessFilter.PREMIUM_PRO) {
      queryBuilder.andWhere(premiumAccessExists);
    } else if (accessTier === AdminUserAccessFilter.FREE) {
      queryBuilder.andWhere(`NOT (${premiumAccessExists})`);
    }

    if (accountStatus === AdminUserAccountStatusFilter.ACTIVE) {
      queryBuilder.andWhere('appUser.isBanned = false');
    } else if (accountStatus === AdminUserAccountStatusFilter.RESTRICTED) {
      queryBuilder.andWhere('appUser.isBanned = true');
    }

    const total = await queryBuilder.getCount();

    this.applyDirectorySort(queryBuilder, {
      sortBy,
      sortOrder,
    });

    const result = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getRawAndEntities<RawDirectoryRow>();

    const items = await Promise.all(
      result.entities.map(async (user, index) => {
        const raw = result.raw[index] ?? {};

        return {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,

          avatarUrl: await this.resolveAvatarUrl(user),

          profilePhotoFileId: user.profilePhotoFileId,

          joinedAt: (user.joinedAt ?? user.createdAt).toISOString(),

          accessTier:
            raw.access_tier ?? (await this.resolveAccessTier(user.id)),

          accountStatus: user.isBanned
            ? ('restricted' as const)
            : ('active' as const),

          isRestricted: user.isBanned,

          totalXp: Number(raw.resolved_total_xp ?? user.totalXp ?? 0),

          lastActivityAt: raw.last_activity_at
            ? new Date(raw.last_activity_at).toISOString()
            : null,
        };
      }),
    );

    return {
      items,

      meta: this.buildMeta(page, limit, total),

      appliedFilters: {
        search,
        accessTier,
        accountStatus,
        sortBy,
        sortOrder,
      },
    };
  }

  async getUserDetails(userId: string): Promise<AdminUserDetailsResponse> {
    const user = await this.getDirectoryUser(userId);

    const [
      leaderboardProfile,
      streak,
      accessTier,
      examResults,
      enrolledCourses,
      activityAnalytics,
    ] = await Promise.all([
      this.leaderboardProfileRepository.findOne({
        where: {
          userId,
        },
      }),

      this.userStreakRepository.findOne({
        where: {
          userId,
        },
      }),

      this.resolveAccessTier(userId),

      this.getUserExamResults(userId, {
        page: 1,
        limit: 3,
      }),

      this.getUserCourses(userId, {
        page: 1,
        limit: 3,
      }),

      this.getUserActivityAnalytics(userId, {
        days: 30,
      }),
    ]);

    const totalXp = Math.max(
      leaderboardProfile?.totalXp ?? 0,
      user.totalXp ?? 0,
    );

    const currentStreakDays = Math.max(
      streak?.currentDays ?? 0,
      leaderboardProfile?.streakDays ?? 0,
      user.currentStreakDays ?? 0,
    );

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,

        avatarUrl: await this.resolveAvatarUrl(user),

        profilePhotoFileId: user.profilePhotoFileId,

        joinedAt: (user.joinedAt ?? user.createdAt).toISOString(),

        accessTier,
        totalXp,
        currentStreakDays,

        longestStreakDays: Math.max(
          streak?.longestDays ?? 0,
          currentStreakDays,
        ),

        isRestricted: user.isBanned,

        accountStatus: user.isBanned ? 'restricted' : 'active',

        isVerified: user.isVerified,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
      },

      examResults,
      enrolledCourses,
      activityAnalytics,

      actions: {
        giftReward: {
          configurationEndpoint: `/admin/leaderboard/users/${user.id}/reward-configuration`,

          createEndpoint: `/admin/leaderboard/users/${user.id}/rewards`,
        },

        message: {
          endpoint: '/chat/direct',
          method: 'POST',
          body: {
            otherUserId: user.id,
          },
        },

        restriction: {
          endpoint: `/admin/users/${user.id}/restriction`,

          method: 'PATCH',

          nextAction: user.isBanned ? 'restore' : 'restrict',
        },
      },
    };
  }

  async getUserExamResults(
    userId: string,
    query: AdminUserExamResultsQueryDto,
  ): Promise<AdminUserExamResultsResponse> {
    await this.assertDirectoryUserExists(userId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const sortBy = query.sortBy ?? AdminUserExamSortBy.COMPLETED_AT;

    const sortOrder = query.sortOrder ?? AdminUserSortOrder.DESC;

    const search = query.search?.trim() || null;

    const queryBuilder = this.examAttemptRepository
      .createQueryBuilder('attempt')
      .leftJoinAndSelect('attempt.examTemplate', 'examTemplate')
      .leftJoinAndSelect('attempt.course', 'course')
      .leftJoinAndSelect('attempt.review', 'review')
      .leftJoinAndSelect('review.metric', 'metric')
      .where('attempt.userId = :userId', {
        userId,
      })
      .andWhere('attempt.status IN (:...statuses)', {
        statuses: [
          ExamAttemptStatus.EVALUATED,
          ExamAttemptStatus.CERTIFICATE_ISSUED,
          ExamAttemptStatus.RETAKE_REQUESTED,
        ],
      })
      .andWhere('review.id IS NOT NULL');

    if (search) {
      queryBuilder.andWhere(
        new Brackets((where) => {
          where
            .where('LOWER(examTemplate.title) LIKE :search')
            .orWhere('LOWER(course.title) LIKE :search')
            .orWhere('LOWER(attempt.referenceCode) LIKE :search');
        }),
        {
          search: `%${search.toLowerCase()}%`,
        },
      );
    }

    const total = await queryBuilder.getCount();

    /*
     * Do not pass COALESCE(...) directly to orderBy().
     * TypeORM may interpret part of the expression as an
     * entity alias when skip/take pagination is applied.
     */
    const completedAtExpression = `
    COALESCE(
      "metric"."gradedAt",
      "review"."updatedAt",
      "attempt"."submittedAt"
    )
  `;

    const scoreExpression = `
    COALESCE(
      "review"."finalAverageScore",
      0
    )
  `;

    const titleExpression = `
    COALESCE(
      "examTemplate"."title",
      ''
    )
  `;

    queryBuilder
      .addSelect(completedAtExpression, 'resolved_completed_at')
      .addSelect(scoreExpression, 'resolved_score')
      .addSelect(titleExpression, 'resolved_exam_title');

    const sortAliasMap: Record<AdminUserExamSortBy, string> = {
      [AdminUserExamSortBy.COMPLETED_AT]: 'resolved_completed_at',

      [AdminUserExamSortBy.SCORE]: 'resolved_score',

      [AdminUserExamSortBy.TITLE]: 'resolved_exam_title',
    };

    queryBuilder
      .orderBy(sortAliasMap[sortBy], sortOrder, 'NULLS LAST')
      .addOrderBy('attempt.id', AdminUserSortOrder.ASC)
      .skip((page - 1) * limit)
      .take(limit);

    const attempts = await queryBuilder.getMany();

    return {
      items: attempts.map((attempt) => {
        const completedAt =
          attempt.review?.metric?.gradedAt ??
          attempt.review?.updatedAt ??
          attempt.submittedAt;

        const title = attempt.examTemplate?.title ?? 'Final Exam';

        const courseTitle = attempt.course?.title ?? 'Course';

        return {
          attemptId: attempt.id,

          referenceCode: attempt.referenceCode,

          title,

          courseId: attempt.courseId,

          courseTitle,

          levelLabel: this.extractLevelLabel(`${title} ${courseTitle}`),

          scorePercent: Number(attempt.review?.finalAverageScore ?? 0),

          verdict: attempt.review?.verdict ?? 'pending',

          status: attempt.status,

          submittedAt: attempt.submittedAt?.toISOString() ?? null,

          completedAt: completedAt?.toISOString() ?? null,
        };
      }),

      meta: this.buildMeta(page, limit, total),
    };
  }

  async getUserCourses(
    userId: string,
    query: AdminUserCoursesQueryDto,
  ): Promise<AdminUserCoursesResponse> {
    await this.assertDirectoryUserExists(userId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const search = query.search?.trim().toLowerCase() ?? null;

    const sortBy = query.sortBy ?? AdminUserCourseSortBy.ENROLLED_AT;

    const sortOrder = query.sortOrder ?? AdminUserSortOrder.DESC;

    const [commerceEnrollments, legacyEnrollments] = await Promise.all([
      this.courseEnrollmentRepository.find({
        where: {
          userId,
        },
        relations: {
          course: true,
        },
      }),

      this.legacyEnrollmentRepository.find({
        where: {
          userId,
        },
        relations: {
          course: true,
        },
      }),
    ]);

    const courseIds = Array.from(
      new Set([
        ...commerceEnrollments.map((item) => item.courseId),

        ...legacyEnrollments.map((item) => item.courseId),
      ]),
    );

    const progressRows =
      courseIds.length > 0
        ? await this.courseProgressRepository.find({
            where: {
              userId,
              courseId: In(courseIds),
            },
          })
        : [];

    const progressByCourseId = new Map(
      progressRows.map((progress) => [progress.courseId, progress]),
    );

    const merged = new Map<string, AdminUserCourseItem>();

    for (const enrollment of legacyEnrollments) {
      const progress = progressByCourseId.get(enrollment.courseId);

      merged.set(enrollment.courseId, {
        enrollmentId: enrollment.id,

        enrollmentSource: 'legacy',

        courseId: enrollment.courseId,

        title: enrollment.course.title,

        subtitle: enrollment.course.subtitle,

        isFree: enrollment.course.isFree,

        enrollmentStatus: enrollment.status,

        enrolledAt: enrollment.enrolledAt.toISOString(),

        completionPercent: progress?.completionPercent ?? 0,

        completedLessons: progress?.completedLessons ?? 0,

        totalLessons: progress?.totalLessons ?? 0,

        lastActivityAt: progress?.lastActivityAt?.toISOString() ?? null,
      });
    }

    for (const enrollment of commerceEnrollments) {
      const progress = progressByCourseId.get(enrollment.courseId);

      merged.set(enrollment.courseId, {
        enrollmentId: enrollment.id,

        enrollmentSource: 'commerce',

        courseId: enrollment.courseId,

        title: enrollment.course.title,

        subtitle: enrollment.course.subtitle,

        isFree: enrollment.course.isFree,

        enrollmentStatus: enrollment.status,

        enrolledAt: enrollment.enrolledAt.toISOString(),

        completionPercent: progress?.completionPercent ?? 0,

        completedLessons: progress?.completedLessons ?? 0,

        totalLessons: progress?.totalLessons ?? 0,

        lastActivityAt:
          progress?.lastActivityAt?.toISOString() ??
          enrollment.lastAccessedAt?.toISOString() ??
          null,
      });
    }

    let items = Array.from(merged.values());

    if (search) {
      items = items.filter((item) =>
        `${item.title} ${item.subtitle ?? ''}`.toLowerCase().includes(search),
      );
    }

    const direction = sortOrder === AdminUserSortOrder.ASC ? 1 : -1;

    items.sort((left, right) => {
      let comparison = 0;

      if (sortBy === AdminUserCourseSortBy.TITLE) {
        comparison = left.title.localeCompare(right.title);
      } else if (sortBy === AdminUserCourseSortBy.PROGRESS) {
        comparison = left.completionPercent - right.completionPercent;
      } else if (sortBy === AdminUserCourseSortBy.LAST_ACTIVITY_AT) {
        comparison =
          this.toTimestamp(left.lastActivityAt) -
          this.toTimestamp(right.lastActivityAt);
      } else {
        comparison =
          this.toTimestamp(left.enrolledAt) -
          this.toTimestamp(right.enrolledAt);
      }

      if (comparison === 0) {
        return left.courseId.localeCompare(right.courseId);
      }

      return comparison * direction;
    });

    const total = items.length;
    const offset = (page - 1) * limit;

    return {
      items: items.slice(offset, offset + limit),

      meta: this.buildMeta(page, limit, total),
    };
  }

  async getUserActivityAnalytics(
    userId: string,
    query: AdminUserActivityQueryDto,
  ): Promise<AdminUserActivityAnalyticsResponse> {
    await this.assertDirectoryUserExists(userId);

    const [analytics, streak] = await Promise.all([
      this.learningActivityService.getUserActivityAnalytics(
        userId,
        query.days ?? 30,
      ),

      this.userStreakRepository.findOne({
        where: {
          userId,
        },
      }),
    ]);

    return {
      range: {
        days: analytics.days,
        startDate: analytics.startDate,
        endDate: analytics.endDate,
      },

      currentStreakDays: Math.max(0, streak?.currentDays ?? 0),

      longestStreakDays: Math.max(0, streak?.longestDays ?? 0),

      totalSeconds: analytics.totalSeconds,

      totalHours: analytics.totalHours,

      rangeTotalSeconds: analytics.rangeTotalSeconds,

      rangeTotalHours: analytics.rangeTotalHours,

      activeDays: analytics.activeDays,

      averageMinutesPerActiveDay: analytics.averageMinutesPerActiveDay,

      maxDailyDurationSeconds: analytics.maxDailyDurationSeconds,

      days: analytics.daily,

      activityTypeBreakdown: analytics.activityTypeBreakdown,
    };
  }

  async updateRestriction(params: {
    adminUserId: string;
    userId: string;
    dto: UpdateAdminUserRestrictionDto;
  }) {
    if (params.adminUserId === params.userId) {
      throw new ForbiddenException('You cannot restrict your own account.');
    }

    const user = await this.getDirectoryUser(params.userId);

    if (user.isBanned === params.dto.isBanned) {
      return {
        changed: false,

        message: params.dto.isBanned
          ? 'The account is already restricted.'
          : 'The account is already active.',

        user: {
          id: user.id,
          fullName: user.fullName,
          isBanned: user.isBanned,

          accountStatus: user.isBanned
            ? ('restricted' as const)
            : ('active' as const),
        },
      };
    }

    user.isBanned = params.dto.isBanned;

    const savedUser = await this.userRepository.save(user);

    return {
      changed: true,

      message: savedUser.isBanned
        ? 'User account restricted successfully.'
        : 'User account restored successfully.',

      user: {
        id: savedUser.id,
        fullName: savedUser.fullName,
        isBanned: savedUser.isBanned,

        accountStatus: savedUser.isBanned
          ? ('restricted' as const)
          : ('active' as const),
      },
    };
  }

  async quickRestrict(adminUserId: string, dto: QuickRestrictUserDto) {
    const identifier = dto.identifier.trim();

    if (!identifier) {
      throw new BadRequestException('User identifier is required.');
    }

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .where('user.role = :role', {
        role: UserRole.USER,
      });

    if (this.isUuid(identifier)) {
      queryBuilder.andWhere('user.id = :identifier', {
        identifier,
      });
    } else {
      queryBuilder.andWhere(
        new Brackets((where) => {
          where
            .where(`LOWER(COALESCE(user.email, '')) = :normalized`)
            .orWhere(`COALESCE(user.phone, '') = :identifier`);
        }),
        {
          normalized: identifier.toLowerCase(),
          identifier,
        },
      );
    }

    const user = await queryBuilder.getOne();

    if (!user) {
      throw new NotFoundException(
        'No user matched that UUID, email address, or phone number.',
      );
    }

    return this.updateRestriction({
      adminUserId,
      userId: user.id,

      dto: {
        isBanned: true,
      },
    });
  }

  private async countActiveUsersBetween(start: Date, end: Date) {
    const row = await this.activityRepository
      .createQueryBuilder('activity')
      .innerJoin(User, 'user', 'user.id = activity.userId')
      .select('COUNT(DISTINCT activity.userId)', 'count')
      .where('user.role = :role', {
        role: UserRole.USER,
      })
      .andWhere('activity.startedAt >= :start', {
        start,
      })
      .andWhere('activity.startedAt < :end', {
        end,
      })
      .getRawOne<{
        count: string;
      }>();

    return Number(row?.count ?? 0);
  }

  private async countPremiumProUsers(): Promise<number> {
    const userAlias = 'appUser';

    const premiumAccessExists =
      this.buildPremiumAccessExistsExpression(userAlias);

    return this.userRepository
      .createQueryBuilder(userAlias)
      .where('appUser.role = :role', {
        role: UserRole.USER,
      })
      .andWhere(premiumAccessExists)
      .setParameters({
        paidStatus: CoursePurchaseStatus.PAID,
        activeEnrollmentStatus: CourseEnrollmentStatus.ACTIVE,
      })
      .getCount();
  }

  private async countUsersCreatedBetween(start: Date, end: Date) {
    return this.userRepository
      .createQueryBuilder('user')
      .where('user.role = :role', {
        role: UserRole.USER,
      })
      .andWhere('user.createdAt >= :start', {
        start,
      })
      .andWhere('user.createdAt < :end', {
        end,
      })
      .getCount();
  }

  private buildPremiumAccessExistsExpression(userAlias: string): string {
    const userIdColumn = `"${userAlias}"."id"`;

    return `
    (
      EXISTS (
        SELECT 1
        FROM "course_purchase_orders" paid_order
        WHERE paid_order."userId" = ${userIdColumn}
          AND paid_order.status = :paidStatus
      )

      OR EXISTS (
        SELECT 1
        FROM "course_enrollments" commerce_enrollment
        INNER JOIN "courses" commerce_course
          ON commerce_course.id =
             commerce_enrollment."courseId"
        WHERE commerce_enrollment."userId" =
              ${userIdColumn}
          AND commerce_enrollment.status =
              :activeEnrollmentStatus
          AND commerce_course."isFree" = false
      )

      OR EXISTS (
        SELECT 1
        FROM "user_course_enrollments" legacy_enrollment
        INNER JOIN "courses" legacy_course
          ON legacy_course.id =
             legacy_enrollment."courseId"
        WHERE legacy_enrollment."userId" =
              ${userIdColumn}
          AND legacy_course."isFree" = false
      )
    )
  `;
  }

  private applyDirectorySort(
    queryBuilder: SelectQueryBuilder<User>,
    params: {
      sortBy: AdminUserDirectorySortBy;
      sortOrder: AdminUserSortOrder;
    },
  ): void {
    const sortMap: Record<AdminUserDirectorySortBy, string> = {
      [AdminUserDirectorySortBy.NAME]: 'appUser.fullName',

      [AdminUserDirectorySortBy.JOINED_AT]: 'resolved_joined_at',

      [AdminUserDirectorySortBy.ACCESS_TIER]: 'access_tier',

      [AdminUserDirectorySortBy.TOTAL_XP]: 'resolved_total_xp',

      [AdminUserDirectorySortBy.LAST_ACTIVITY_AT]: 'last_activity_at',
    };

    queryBuilder
      .orderBy(sortMap[params.sortBy], params.sortOrder, 'NULLS LAST')
      .addOrderBy('appUser.id', AdminUserSortOrder.ASC);
  }

  private async resolveAccessTier(
    userId: string,
  ): Promise<AdminUserAccessTier> {
    const userAlias = 'appUser';

    const premiumAccessExists =
      this.buildPremiumAccessExistsExpression(userAlias);

    const count = await this.userRepository
      .createQueryBuilder(userAlias)
      .where('appUser.id = :userId', {
        userId,
      })
      .andWhere('appUser.role = :role', {
        role: UserRole.USER,
      })
      .andWhere(premiumAccessExists)
      .setParameters({
        paidStatus: CoursePurchaseStatus.PAID,
        activeEnrollmentStatus: CourseEnrollmentStatus.ACTIVE,
      })
      .getCount();

    return count > 0
      ? AdminUserAccessTier.PREMIUM_PRO
      : AdminUserAccessTier.FREE;
  }

  private async getDirectoryUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: {
        id: userId,
      },
    });

    if (!user || user.role !== UserRole.USER) {
      throw new NotFoundException('Directory user not found.');
    }

    return user;
  }

  private async assertDirectoryUserExists(userId: string): Promise<void> {
    await this.getDirectoryUser(userId);
  }

  private async resolveAvatarUrl(user: User): Promise<string | null> {
    if (user.avatarUrl?.trim()) {
      return user.avatarUrl.trim();
    }

    if (!user.profilePhotoFileId) {
      return null;
    }

    try {
      const file = await this.filesService.findActiveFileById(
        user.profilePhotoFileId,
      );

      if (file.visibility === FileVisibility.PUBLIC) {
        return this.s3Service.createPublicUrl(file.storageKey);
      }

      const signed = await this.filesService.createSignedReadUrl(file.id);

      return signed.signedReadUrl;
    } catch {
      return null;
    }
  }

  private getGrowthBucketConfiguration(
    range: AdminUserGrowthRange,
  ): GrowthBucketConfiguration {
    const now = new Date();

    if (range === AdminUserGrowthRange.DAY) {
      const end = this.addHours(this.startOfUtcHour(now), 1);

      const start = this.addHours(end, -24);

      return {
        range,
        sqlUnit: 'hour',
        periodStart: start,
        periodEnd: end,

        buckets: this.generateBuckets(start, 24, 'hour'),
      };
    }

    if (range === AdminUserGrowthRange.WEEK) {
      const end = this.addDays(this.startOfUtcDay(now), 1);

      const start = this.addDays(end, -7);

      return {
        range,
        sqlUnit: 'day',
        periodStart: start,
        periodEnd: end,

        buckets: this.generateBuckets(start, 7, 'day'),
      };
    }

    const end = this.addMonths(this.startOfUtcMonth(now), 1);

    const start = this.addMonths(end, -6);

    return {
      range,
      sqlUnit: 'month',
      periodStart: start,
      periodEnd: end,

      buckets: this.generateBuckets(start, 6, 'month'),
    };
  }

  private generateBuckets(
    start: Date,
    count: number,
    unit: 'hour' | 'day' | 'month',
  ) {
    return Array.from(
      {
        length: count,
      },
      (_, index) => this.addGrowthBucket(start, unit, index),
    );
  }

  private addGrowthBucket(
    date: Date,
    unit: 'hour' | 'day' | 'month',
    amount: number,
  ) {
    if (unit === 'hour') {
      return this.addHours(date, amount);
    }

    if (unit === 'day') {
      return this.addDays(date, amount);
    }

    return this.addMonths(date, amount);
  }

  private toBucketKey(date: Date, unit: 'hour' | 'day' | 'month') {
    if (unit === 'hour') {
      return this.startOfUtcHour(date).toISOString();
    }

    if (unit === 'day') {
      return this.startOfUtcDay(date).toISOString();
    }

    return this.startOfUtcMonth(date).toISOString();
  }

  private formatGrowthLabel(date: Date, range: AdminUserGrowthRange) {
    if (range === AdminUserGrowthRange.DAY) {
      return `${String(date.getUTCHours()).padStart(2, '0')}:00`;
    }

    if (range === AdminUserGrowthRange.WEEK) {
      return new Intl.DateTimeFormat('en', {
        weekday: 'short',
        timeZone: 'UTC',
      }).format(date);
    }

    return new Intl.DateTimeFormat('en', {
      month: 'short',
      timeZone: 'UTC',
    }).format(date);
  }

  private extractLevelLabel(value: string): string | null {
    return value.toUpperCase().match(/\b(A1|A2|B1|B2|C1|C2)\b/)?.[1] ?? null;
  }

  private calculatePercentChange(currentIncrease: number, baseline: number) {
    if (baseline === 0) {
      return currentIncrease > 0 ? 100 : 0;
    }

    return Number(((currentIncrease / baseline) * 100).toFixed(2));
  }

  private calculatePercentDifference(current: number, previous: number) {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }

    return Number((((current - previous) / previous) * 100).toFixed(2));
  }

  private buildMeta(page: number, limit: number, total: number) {
    const totalPages = Math.ceil(total / limit);

    return {
      page,
      limit,
      total,
      totalPages,

      hasPreviousPage: page > 1,

      hasNextPage: page < totalPages,
    };
  }

  private startOfUtcHour(date: Date) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
      ),
    );
  }

  private startOfUtcDay(date: Date) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private startOfUtcMonth(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  private addHours(date: Date, hours: number) {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);

    result.setUTCDate(result.getUTCDate() + days);

    return result;
  }

  private addMonths(date: Date, months: number) {
    const result = new Date(date);

    result.setUTCMonth(result.getUTCMonth() + months);

    return result;
  }

  private toTimestamp(value: string | null) {
    if (!value) {
      return 0;
    }

    const timestamp = new Date(value).getTime();

    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
