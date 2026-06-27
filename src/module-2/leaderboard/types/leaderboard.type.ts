export enum LeagueKey {
  BRONZE = 'bronze',
  SILVER = 'silver',
  GOLD = 'gold',
  DIAMOND = 'diamond',
}

export enum LeaderboardScope {
  MY_LEAGUE = 'my_league',
  GLOBAL = 'global',
}

export enum LeaderboardZone {
  PROMOTION = 'promotion',
  SAFE = 'safe',
  DEMOTION = 'demotion',
}

export enum LeaderboardXpSourceType {
  QUIZ_ANSWER = 'quiz_answer',
  QUIZ_COMPLETION = 'quiz_completion',
  LESSON_COMPLETION = 'lesson_completion',
  FLASHCARD_COMPLETION = 'flashcard_completion',
  DAILY_CHALLENGE = 'daily_challenge',
  ADMIN_REWARD = 'admin_reward',
  OTHER = 'other',
}

export enum LeaderboardRewardType {
  /**
   * Keep PHYSICAL_GIFT for old database compatibility.
   */
  PHYSICAL_GIFT = 'physical_gift',
  PHYSICAL_PRIZE = 'physical_prize',

  STREAK_FREEZE = 'streak_freeze',
  CV_CREDITS = 'cv_credits',
  AI_PACKAGE = 'ai_package',
  XP = 'xp',

  COURSE_ACCESS = 'course_access',
  DOWNLOADABLE_FILE = 'downloadable_file',
  CERTIFICATE = 'certificate',
  BADGE = 'badge',
}

export enum LeaderboardRewardStatus {
  PENDING = 'pending',
  NOTIFIED = 'notified',
  OPENED = 'opened',

  ADDRESS_PENDING = 'address_pending',
  ADDRESS_RECEIVED = 'address_received',

  APPROVED = 'approved',
  PROCESSING = 'processing',
  DISPATCHED = 'dispatched',
  DELIVERED = 'delivered',

  ISSUED = 'issued',
  CLAIMED = 'claimed',

  REVOKED = 'revoked',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export enum LeaderboardRewardNotificationType {
  GIFT_AWARDED = 'gift_awarded',
  ADDRESS_REQUEST = 'address_request',
  ADDRESS_RECEIVED = 'address_received',
  FULFILLMENT_UPDATE = 'fulfillment_update',
  REWARD_DISPATCHED = 'reward_dispatched',
  REWARD_DELIVERED = 'reward_delivered',
  REWARD_REVOKED = 'reward_revoked',
}

export enum LeaderboardRewardNotificationStatus {
  QUEUED = 'queued',
  SENT = 'sent',
  FAILED = 'failed',
}

export enum LeaderboardSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}
