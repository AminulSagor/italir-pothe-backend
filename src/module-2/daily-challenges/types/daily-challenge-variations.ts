import {
  DailyChallengeTaskKey,
  DailyChallengeVariation,
} from './daily-challenge.type';

export const DAILY_CHALLENGE_VARIATIONS: DailyChallengeVariation[] = [
  {
    key: 'daily_challenge_variation_01',
    tasks: [
      {
        key: DailyChallengeTaskKey.LEARN_NEW_WORDS,
        title: 'Learn 5 New Words',
        targetValue: 5,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.QUIZ_SCORE_80,
        title: 'Get 80% on a Quiz',
        targetValue: 1,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.LISTEN_AUDIO_TRACKS,
        title: 'Listen to 3 Audio Tracks',
        targetValue: 3,
        rewardXp: 15,
      },
    ],
  },
  {
    key: 'daily_challenge_variation_02',
    tasks: [
      {
        key: DailyChallengeTaskKey.REVIEW_IMPORTANT_VERB,
        title: 'Review 1 Important Verb Conjugation',
        targetValue: 1,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.READ_THEORY_PAGE,
        title: 'Read 1 Theory / Grammar Page',
        targetValue: 1,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.FILL_BLANK_CORRECT,
        title: 'Correctly Answer 5 “Fill in the Blanks” Quiz Questions',
        targetValue: 5,
        rewardXp: 10,
      },
    ],
  },
  {
    key: 'daily_challenge_variation_03',
    tasks: [
      {
        key: DailyChallengeTaskKey.CLEAR_WEAK_FLASHCARDS,
        title: 'Clear 5 Words from your “Needs Review” Flashcard Stack',
        targetValue: 5,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.MATCH_PAIRS_100,
        title: 'Complete a “Match the Pairs” Quiz with 100% Accuracy',
        targetValue: 1,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.ANSWER_COMBO_5,
        title: 'Achieve a 5 Answer Combo Streak in any Quiz',
        targetValue: 5,
        rewardXp: 5,
      },
    ],
  },
  {
    key: 'daily_challenge_variation_04',
    tasks: [
      {
        key: DailyChallengeTaskKey.EARN_FAST_FINISH_BONUS,
        title: 'Earn the “+15 XP Fast Finish Bonus” on any Quiz',
        targetValue: 1,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.FLASHCARD_SWIPES,
        title: 'Complete 15 Flashcard Swipes',
        targetValue: 15,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.EARN_XP_50,
        title: 'Earn 50 XP total in one day',
        targetValue: 50,
        rewardXp: 15,
      },
    ],
  },
  {
    key: 'daily_challenge_variation_05',
    tasks: [
      {
        key: DailyChallengeTaskKey.WATCH_VIDEO_80,
        title: 'Watch a Video Lesson to the 80% Unlock Mark',
        targetValue: 100,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.COMPLETE_CHAPTER_QUIZ_AFTER_VIDEO,
        title: 'Complete the Chapter Quiz immediately following a video',
        targetValue: 1,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.LEARN_VERBS,
        title: 'Learn 3 New Verbs',
        targetValue: 3,
        rewardXp: 15,
      },
    ],
  },
  {
    key: 'daily_challenge_variation_06',
    tasks: [
      {
        key: DailyChallengeTaskKey.AUDIO_TRANSCRIPTION_NO_MISTAKES,
        title:
          'Complete an “Audio Transcription” Quiz Question without mistakes',
        targetValue: 1,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.TRUE_FALSE_AUDIO_CORRECT,
        title: 'Get 3 “True/False” Audio Questions Correct',
        targetValue: 3,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.LISTEN_TRACKS_HUB,
        title: 'Listen to 5 Audio Tracks in the Practice Hub',
        targetValue: 5,
        rewardXp: 5,
      },
    ],
  },
  {
    key: 'daily_challenge_variation_07',
    tasks: [
      {
        key: DailyChallengeTaskKey.ACTIVE_LEARNING_MINUTES,
        title: 'Spend 15 minutes actively learning in the app',
        targetValue: 15,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.REVIEW_VOCAB_WORDS,
        title: 'Review 20 Vocabulary Words total',
        targetValue: 20,
        rewardXp: 20,
      },
      {
        key: DailyChallengeTaskKey.EARN_XP_100,
        title: 'Earn a total of 100 XP today to climb the Leaderboard',
        targetValue: 100,
        rewardXp: 50,
      },
    ],
  },
];
