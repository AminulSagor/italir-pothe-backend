export enum DailyChallengeTaskKey {
  LEARN_NEW_WORDS = 'learn_new_words',
  QUIZ_SCORE_80 = 'quiz_score_80',
  LISTEN_AUDIO_TRACKS = 'listen_audio_tracks',

  REVIEW_IMPORTANT_VERB = 'review_important_verb',
  READ_THEORY_PAGE = 'read_theory_page',
  FILL_BLANK_CORRECT = 'fill_blank_correct',

  CLEAR_WEAK_FLASHCARDS = 'clear_weak_flashcards',
  MATCH_PAIRS_100 = 'match_pairs_100',
  ANSWER_COMBO_5 = 'answer_combo_5',

  EARN_FAST_FINISH_BONUS = 'earn_fast_finish_bonus',
  FLASHCARD_SWIPES = 'flashcard_swipes',
  EARN_XP_50 = 'earn_xp_50',

  WATCH_VIDEO_80 = 'watch_video_80',
  COMPLETE_CHAPTER_QUIZ_AFTER_VIDEO = 'complete_chapter_quiz_after_video',
  LEARN_VERBS = 'learn_verbs',

  AUDIO_TRANSCRIPTION_NO_MISTAKES = 'audio_transcription_no_mistakes',
  TRUE_FALSE_AUDIO_CORRECT = 'true_false_audio_correct',
  LISTEN_TRACKS_HUB = 'listen_tracks_hub',

  ACTIVE_LEARNING_MINUTES = 'active_learning_minutes',
  REVIEW_VOCAB_WORDS = 'review_vocab_words',
  EARN_XP_100 = 'earn_xp_100',
}

export enum LearningActivityType {
  QUIZ_COMPLETED = 'quiz_completed',
  QUIZ_SCORE_80 = 'quiz_score_80',
  QUIZ_FAST_FINISH_BONUS = 'quiz_fast_finish_bonus',
  QUIZ_ANSWER_COMBO = 'quiz_answer_combo',
  QUIZ_FILL_BLANKS_CORRECT = 'quiz_fill_blanks_correct',
  QUIZ_MATCH_PAIRS_PERFECT = 'quiz_match_pairs_perfect',
  QUIZ_AUDIO_TRANSCRIPTION_CORRECT = 'quiz_audio_transcription_correct',
  QUIZ_TRUE_FALSE_AUDIO_CORRECT = 'quiz_true_false_audio_correct',

  XP_EARNED = 'xp_earned',
  AUDIO_TRACK_LISTENED = 'audio_track_listened',

  VOCABULARY_FLASHCARD_REVIEWED = 'vocabulary_flashcard_reviewed',
  VOCABULARY_WORD_LEARNED = 'vocabulary_word_learned',
  VOCABULARY_WEAK_WORD_CLEARED = 'vocabulary_weak_word_cleared',

  LESSON_THEORY_READ = 'lesson_theory_read',
  LESSON_VIDEO_WATCHED = 'lesson_video_watched',
  LESSON_COMPLETED = 'lesson_completed',
  ACTIVE_LEARNING_MINUTES = 'active_learning_minutes',

  FINAL_EXAM_SUBMITTED = 'final_exam_submitted',

  SURVIVAL_ITALIAN_COMPLETED = 'survival_italian_completed',
  IMPORTANT_VERB_REVIEWED = 'important_verb_reviewed',
  JOB_SENTENCE_REVIEWED = 'job_sentence_reviewed',
}

export interface DailyChallengeTaskDefinition {
  key: DailyChallengeTaskKey;
  title: string;
  targetValue: number;
  rewardXp: number;
}

export interface DailyChallengeVariation {
  key: string;
  tasks: DailyChallengeTaskDefinition[];
}
