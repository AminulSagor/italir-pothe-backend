export enum CvAssistantConversationMode {
  ONE_BY_ONE = 'one_by_one',
  ALL_AT_ONCE = 'all_at_once',
}

export enum CvAssistantSessionStatus {
  ACTIVE = 'active',
  READY_TO_GENERATE = 'ready_to_generate',
  GENERATING = 'generating',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum CvAssistantMessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export enum CvAssistantQuestionType {
  TEXT = 'text',
  LONG_TEXT = 'long_text',
  EMAIL = 'email',
  PHONE = 'phone',
  URL = 'url',
  LIST = 'list',
  CHOICE = 'choice',
}
