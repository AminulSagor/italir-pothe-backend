export enum AdminUserAccessTier {
  FREE = 'free',
  PREMIUM_PRO = 'premium_pro',
}

export enum AdminUserAccessFilter {
  ALL = 'all',
  FREE = 'free',
  PREMIUM_PRO = 'premium_pro',
}

export enum AdminUserAccountStatusFilter {
  ALL = 'all',
  ACTIVE = 'active',
  RESTRICTED = 'restricted',
}

export enum AdminUserDirectorySortBy {
  NAME = 'name',
  JOINED_AT = 'joinedAt',
  ACCESS_TIER = 'accessTier',
  TOTAL_XP = 'totalXp',
  LAST_ACTIVITY_AT = 'lastActivityAt',
}

export enum AdminUserExamSortBy {
  COMPLETED_AT = 'completedAt',
  SCORE = 'score',
  TITLE = 'title',
}

export enum AdminUserCourseSortBy {
  ENROLLED_AT = 'enrolledAt',
  PROGRESS = 'progress',
  TITLE = 'title',
  LAST_ACTIVITY_AT = 'lastActivityAt',
}

export enum AdminUserGrowthRange {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export enum AdminUserSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export interface AdminUserDirectoryMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface AdminUserSummaryMetric {
  value: number;
  changePercent: number;
  comparisonPeriod: string;
}

export interface AdminUserDashboardResponse {
  totalUsers: AdminUserSummaryMetric;

  activeThisMonth: AdminUserSummaryMetric;

  premiumProUsers: {
    count: number;
    percentage: number;
  };

  newSignupsToday: AdminUserSummaryMetric;

  generatedAt: string;
  timezone: 'UTC';
}

export interface AdminUserGrowthPoint {
  bucketStart: string;
  bucketEnd: string;
  label: string;
  newUsers: number;
  totalUsers: number;
}

export interface AdminUserGrowthResponse {
  range: AdminUserGrowthRange;
  periodStart: string;
  periodEnd: string;
  usersBeforePeriod: number;
  newUsers: number;
  totalUsersAtEnd: number;
  points: AdminUserGrowthPoint[];
  timezone: 'UTC';
}

export interface AdminUserDirectoryItem {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  profilePhotoFileId: string | null;
  joinedAt: string;
  accessTier: AdminUserAccessTier;
  accountStatus: 'active' | 'restricted';
  isRestricted: boolean;
  totalXp: number;
  lastActivityAt: string | null;
}

export interface AdminUserDirectoryResponse {
  items: AdminUserDirectoryItem[];

  meta: AdminUserDirectoryMeta;

  appliedFilters: {
    search: string | null;
    accessTier: AdminUserAccessFilter;
    accountStatus: AdminUserAccountStatusFilter;
    sortBy: AdminUserDirectorySortBy;
    sortOrder: AdminUserSortOrder;
  };
}

export interface AdminUserExamResultItem {
  attemptId: string;
  referenceCode: string;
  title: string;
  courseId: string;
  courseTitle: string;
  levelLabel: string | null;
  scorePercent: number;
  verdict: string;
  status: string;
  submittedAt: string | null;
  completedAt: string | null;
}

export interface AdminUserExamResultsResponse {
  items: AdminUserExamResultItem[];
  meta: AdminUserDirectoryMeta;
}

export interface AdminUserCourseItem {
  enrollmentId: string;
  enrollmentSource: 'commerce' | 'legacy';
  courseId: string;
  title: string;
  subtitle: string | null;
  isFree: boolean;
  enrollmentStatus: string;
  enrolledAt: string;
  completionPercent: number;
  completedLessons: number;
  totalLessons: number;
  lastActivityAt: string | null;
}

export interface AdminUserCoursesResponse {
  items: AdminUserCourseItem[];
  meta: AdminUserDirectoryMeta;
}

export interface AdminUserActivityDay {
  date: string;
  durationSeconds: number;
  durationMinutes: number;
  isActive: boolean;
}

export interface AdminUserActivityTypeBreakdown {
  activityType: string;
  durationSeconds: number;
  durationMinutes: number;
  percentage: number;
}

export interface AdminUserActivityAnalyticsResponse {
  range: {
    days: number;
    startDate: string;
    endDate: string;
  };

  currentStreakDays: number;
  longestStreakDays: number;

  totalSeconds: number;
  totalHours: number;

  rangeTotalSeconds: number;
  rangeTotalHours: number;

  activeDays: number;
  averageMinutesPerActiveDay: number;
  maxDailyDurationSeconds: number;

  days: AdminUserActivityDay[];
  activityTypeBreakdown: AdminUserActivityTypeBreakdown[];
}

export interface AdminUserDetailsResponse {
  user: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
    profilePhotoFileId: string | null;
    joinedAt: string;
    accessTier: AdminUserAccessTier;
    totalXp: number;
    currentStreakDays: number;
    longestStreakDays: number;
    isRestricted: boolean;
    accountStatus: 'active' | 'restricted';
    isVerified: boolean;
    isEmailVerified: boolean;
    isPhoneVerified: boolean;
  };

  examResults: AdminUserExamResultsResponse;
  enrolledCourses: AdminUserCoursesResponse;
  activityAnalytics: AdminUserActivityAnalyticsResponse;

  actions: {
    giftReward: {
      configurationEndpoint: string;
      createEndpoint: string;
    };

    message: {
      endpoint: '/chat/direct';
      method: 'POST';
      body: {
        otherUserId: string;
      };
    };

    restriction: {
      endpoint: string;
      method: 'PATCH';
      nextAction: 'restrict' | 'restore';
    };
  };
}
