export enum ExamTemplateStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum ExamSectionType {
  CORE_QUIZ = 'core_quiz',
  LISTENING_LAB = 'listening_lab',
  WRITING_TASK = 'writing_task',
  SPEAKING_LAB = 'speaking_lab',
}

export enum ExamReviewMode {
  AUTO = 'auto',
  MANUAL = 'manual',
}

export enum ExamSectionStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum ExamQuestionStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum ExamAttemptStatus {
  IN_PROGRESS = 'in_progress',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  EVALUATED = 'evaluated',
  CERTIFICATE_ISSUED = 'certificate_issued',
  RETAKE_REQUESTED = 'retake_requested',
  CANCELLED = 'cancelled',
}

export enum ExamAnswerType {
  SINGLE_OPTION = 'single_option',
  TRUE_FALSE = 'true_false',
  TEXT = 'text',
  AUDIO = 'audio',
  SEQUENCE = 'sequence',
  MATCHING = 'matching',
}

export enum ExamVerdict {
  PASSED = 'passed',
  RETAKE_REQUIRED = 'retake_required',
  FAILED = 'failed',
}

export enum ExamRetakePolicy {
  UNLIMITED = 'unlimited',
  ONE_TIME = 'one_time',
  DISABLED = 'disabled',
}

export enum ExamAudioSourceType {
  MANUAL_UPLOAD = 'manual_upload',
  AI_VOICE = 'ai_voice',
}
