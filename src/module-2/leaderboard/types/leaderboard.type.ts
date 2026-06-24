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
  PHYSICAL_GIFT = 'physical_gift',
  BADGE = 'badge',
  XP = 'xp',
}

export enum LeaderboardRewardStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DISPATCHED = 'dispatched',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export enum LeaderboardSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}
