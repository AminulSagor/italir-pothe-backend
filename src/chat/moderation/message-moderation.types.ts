export const MODERATION_CATEGORIES = [
  'profanity',
  'sexual',
  'hate',
  'threat',
  'violence',
  'self_harm',
  'harassment',
] as const;

export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];
export type ModerationAction = 'safe' | 'warn' | 'block';

export interface KeywordScanResult {
  suspicious: boolean;
  categories: ModerationCategory[];
  matchedTerms: string[];
}

export interface LlmModerationResult {
  action: ModerationAction;
  confidence: number;
  categories: ModerationCategory[];
  reason: string;
}

export interface MessageModerationDecision extends LlmModerationResult {
  source: 'local' | 'llm' | 'fail_open';
}

export interface MessageModerationWarning {
  code: 'MESSAGE_ALLOWED_WITH_WARNING';
  message: string;
  categories: ModerationCategory[];
}
