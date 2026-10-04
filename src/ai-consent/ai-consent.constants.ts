export const CURRENT_AI_CONSENT_VERSION = '2026-10-04';

export const AI_CONSENT_PROVIDERS = [
  'Google Gemini',
  'OpenAI',
  'LiveKit and configured speech/voice processors',
] as const;

export const AI_CONSENT_DATA_CATEGORIES = [
  'prompts and conversation context',
  'voice audio and transcripts',
  'language-learning answers and level-test responses',
  'CV text, documents and selected images',
] as const;
