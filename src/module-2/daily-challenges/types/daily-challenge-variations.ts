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
        details:
          'Open a course chapter and choose Vocabulary. Review the flashcards and mark five words you have not learned before as “I Know.” Words already in your Needs Review stack do not count as new words.',
        targetValue: 5,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.QUIZ_SCORE_80,
        title: 'Score 80% or Higher on Any Quiz',
        details:
          'Complete any course quiz with a final score of at least 80%. Your progress is recorded when you submit and finish the quiz.',
        targetValue: 1,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.LISTEN_AUDIO_TRACKS,
        title: 'Listen to 3 Lesson Audio Tracks',
        details:
          'Open a course chapter or quiz and play three audio tracks through to the end. Practice Hub tracks belong to a separate challenge.',
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
        title: 'Review 1 Important Verb',
        details:
          'Go to Practice Hub, open Important Verbs, choose a verb, and use its learning or pronunciation action to complete one review.',
        targetValue: 1,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.READ_THEORY_PAGE,
        title: 'Read 1 Theory or Grammar Page',
        details:
          'Open a course chapter and select its Theory or Grammar material. Open the page or PDF and read it; the challenge is recorded when the theory material opens.',
        targetValue: 1,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.FILL_BLANK_CORRECT,
        title: 'Answer 5 Fill-in-the-Blank Questions Correctly',
        details:
          'Complete fill-in-the-blank questions in course quizzes. Five correct answers count across the quizzes you finish today.',
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
        title: 'Clear 5 Words from Your Needs Review Flashcards',
        details:
          'Open Vocabulary and tap the Needs Attention banner. Review the weak-word flashcards, mark five as “I Know,” and finish the review session so the changes are saved.',
        targetValue: 5,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.MATCH_PAIRS_100,
        title: 'Complete a Match the Pairs Quiz with 100% Accuracy',
        details:
          'Find a course quiz containing a Match the Pairs question. Match every pair correctly without a mistake, then finish and submit the quiz.',
        targetValue: 1,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.ANSWER_COMBO_5,
        title: 'Get 5 Correct Answers in a Row in Any Quiz',
        details:
          'Answer five consecutive quiz questions correctly in one quiz attempt. A wrong answer breaks the streak, so the next correct answer starts a new one.',
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
        title: 'Earn the +15 XP Fast Finish Bonus on Any Quiz',
        details:
          'Complete and submit any timed course quiz quickly enough to receive the +15 XP Fast Finish bonus shown in the quiz results.',
        targetValue: 1,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.FLASHCARD_SWIPES,
        title: 'Review 15 Vocabulary Flashcards',
        details:
          'Open a course chapter, choose Vocabulary, switch to Flashcards, and review 15 cards by selecting “I Know” or “Study Again.”',
        targetValue: 15,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.EARN_XP_50,
        title: 'Earn 50 XP Today',
        details:
          'Earn a total of 50 XP today from lessons, quizzes, and other eligible learning activities. Daily challenge reward XP also contributes after it is claimed.',
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
        title: 'Watch at Least 80% of a Video Lesson',
        details:
          'Open a course chapter and watch its lesson video until at least 80% has played. Skipping ahead does not replace the required watched progress.',
        targetValue: 80,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.COMPLETE_CHAPTER_QUIZ_AFTER_VIDEO,
        title: 'Complete a Chapter Quiz After Its Video',
        details:
          'Watch the chapter video far enough to unlock the quiz, then open and complete that chapter’s quiz. Submit the quiz to record completion.',
        targetValue: 1,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.LEARN_VERBS,
        title: 'Learn 3 New Verbs',
        details:
          'Go to Practice Hub and open Important Verbs. Use the learning or pronunciation action on three verbs you have not reviewed before. New verb vocabulary can also count.',
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
        title: 'Complete an Audio Transcription Question without Mistakes',
        details:
          'Open a course quiz containing an Audio Transcription question. Listen, enter the transcription correctly on the first attempt, and finish the quiz.',
        targetValue: 1,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.LISTENING_MCQ_CORRECT,
        title: 'Answer 3 Listening MCQ Questions Correctly',
        details:
          'Complete Listening MCQ questions in course quizzes and choose the correct answer for three of them. Progress is recorded when the quiz is finished.',
        targetValue: 3,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.LISTEN_TRACKS_HUB,
        title: 'Listen to 5 Audio Tracks in the Practice Hub',
        details:
          'Open Practice Hub and play five learning audio tracks through their completion action. Important Verb pronunciation and Skill Builder sentence audio count toward this challenge.',
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
        title: 'Spend 15 Minutes Actively Learning',
        details:
          'Use lessons, videos, quizzes, vocabulary, or Practice Hub activities for 15 active minutes today. Time is counted from verified learning activity, not simply leaving the app open.',
        targetValue: 15,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.REVIEW_VOCAB_WORDS,
        title: 'Review 20 Vocabulary Words',
        details:
          'Open a course chapter, choose Vocabulary, and review 20 word cards. Each card counts when you select “I Know” or “Study Again.”',
        targetValue: 20,
        rewardXp: 20,
      },
      {
        key: DailyChallengeTaskKey.EARN_XP_100,
        title: 'Earn 100 XP Today',
        details:
          'Earn a total of 100 XP today from eligible lessons, quizzes, and learning activities. Your XP is also reflected on the leaderboard.',
        targetValue: 100,
        rewardXp: 50,
      },
    ],
  },
];
