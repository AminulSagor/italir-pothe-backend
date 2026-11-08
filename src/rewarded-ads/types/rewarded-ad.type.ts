export enum RewardedPlacement {
  FREE_VIDEO = 'free_video',
  DAILY_CHALLENGE_XP = 'daily_challenge_xp',
  DAILY_CHEST = 'daily_chest',
  CAREER_MODULE = 'career_module',
  QUIZ_OPEN = 'quiz_open',
  QUIZ_REVIEW = 'quiz_review',
  VOCABULARY_REVEAL = 'vocabulary_reveal',
  SURVIVAL_PDF = 'survival_pdf',
  VERB_DETAIL = 'verb_detail',
  CALL_CREDITS = 'call_credits',
  CV_CREDITS = 'cv_credits',
}

export enum RewardedSessionStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  GRANTED = 'granted',
  EXPIRED = 'expired',
}

export const INTERVAL_PLACEMENTS = new Set<RewardedPlacement>([
  RewardedPlacement.CAREER_MODULE,
  RewardedPlacement.QUIZ_OPEN,
  RewardedPlacement.VOCABULARY_REVEAL,
  RewardedPlacement.SURVIVAL_PDF,
  RewardedPlacement.VERB_DETAIL,
]);
