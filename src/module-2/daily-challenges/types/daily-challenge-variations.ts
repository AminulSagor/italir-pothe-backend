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
          'Do this: Open a course chapter, choose Vocabulary, mark five previously unlearned words as “I Know,” and finish the full flashcard session.\n\nWhen it records: After the completed session saves each word from New or Learning to Known.\n\nWon’t count: Quitting early, choosing “Study Again,” words already Known or Mastered, or weak words cleared through Needs Review.',
        targetValue: 5,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.QUIZ_SCORE_80,
        title: 'Score 80% or Higher on Any Quiz',
        details:
          'Do this: Finish any course quiz with at least 80% of its questions correct.\n\nWhen it records: After the entire quiz is submitted and the final score is calculated.\n\nWon’t count: An unfinished quiz, a final score below 80%, or reaching 80% temporarily before submitting.',
        targetValue: 1,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.LISTEN_AUDIO_TRACKS,
        title: 'Listen to 3 Lesson Audio Tracks',
        details:
          'Do this: Play three different audio tracks found in course lessons or quiz questions all the way to the end.\n\nWhen it records: Each track counts after playback finishes and its completion request succeeds.\n\nWon’t count: Opening the player without pressing play, stopping early, replaying the same track on the same day, or Practice Hub audio.',
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
          'Do this: Go to Practice Hub, open Important Verbs, choose one verb, and tap one of its pronunciation audio buttons.\n\nWhen it records: After the audio starts successfully and the review request is saved.\n\nWon’t count: Only opening the verb list or details page, an unavailable Italian voice, failed audio, or leaving without tapping an audio button.',
        targetValue: 1,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.READ_THEORY_PAGE,
        title: 'Read 1 Theory or Grammar Page',
        details:
          'Do this: Open an available Theory or Grammar PDF from a course chapter or a Skill Builder career track.\n\nWhen it records: Course theory counts after the PDF loads; Skill Builder theory counts when its available resource is opened.\n\nWon’t count: Only opening the chapter or track, tapping a locked or missing resource, or viewing unrelated content.',
        targetValue: 1,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.FILL_BLANK_CORRECT,
        title: 'Answer 5 Fill-in-the-Blank Questions Correctly',
        details:
          'Do this: Answer five Fill in the Blanks questions correctly in course quizzes. The five answers may come from multiple quizzes today.\n\nWhen it records: Each correct answer counts after that answer is checked and saved.\n\nWon’t count: Incorrect answers, other question formats, an answer that was never submitted, or submitting the same question again.',
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
          'Do this: Open a lesson’s Vocabulary, tap Needs Attention, mark five weak words as “I Know,” and finish the complete Needs Review session.\n\nWhen it records: After the session saves each selected word from Weak to Known.\n\nWon’t count: Quitting early, choosing “Study Again,” marking ordinary new words as known, or reviewing words that were not weak before the session.',
        targetValue: 5,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.MATCH_PAIRS_100,
        title: 'Answer Every Match-the-Pairs Question Correctly',
        details:
          'Do this: In one course quiz, answer every Match the Pair question correctly, then finish the quiz. Other question formats do not need a perfect score for this challenge.\n\nWhen it records: After the full quiz is submitted and all of its Match the Pair questions are correct.\n\nWon’t count: One incorrect Match the Pair question, an unfinished quiz, or a quiz with no Match the Pair questions.',
        targetValue: 1,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.ANSWER_COMBO_5,
        title: 'Get 5 Correct Answers in a Row in Any Quiz',
        details:
          'Do this: Answer five consecutive questions correctly, in question order, during one quiz attempt.\n\nWhen it records: The streak updates as confirmed answers are saved and is also verified when the quiz is submitted.\n\nWon’t count: Correct answers split across different quiz attempts; any wrong answer resets the current streak to zero.',
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
          'Do this: Complete a course quiz within its Fast Finish limit: no more than 13 seconds for each question in the quiz.\n\nWhen it records: After the submitted quiz result awards the +15 XP Fast Finish bonus.\n\nWon’t count: An unfinished quiz, missing or zero recorded time, or a total time above 13 seconds multiplied by the number of questions.',
        targetValue: 1,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.FLASHCARD_SWIPES,
        title: 'Review 15 Vocabulary Flashcards',
        details:
          'Do this: Open a lesson’s Vocabulary, switch to Flashcards, and respond to 15 cards with “I Know” or “Study Again.” You may use more than one session today.\n\nWhen it records: Each card counts after its response request succeeds; you do not need to wait for the whole session to finish.\n\nWon’t count: Only viewing or flipping a card, browsing the vocabulary list, or leaving a card without choosing a response.',
        targetValue: 15,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.EARN_XP_50,
        title: 'Earn 50 XP Today',
        details:
          'Do this: Earn 50 eligible XP today by completing lessons, quizzes, or other XP-awarding learning activities.\n\nWhen it records: The challenge reads today’s saved XP transactions and updates automatically.\n\nWon’t count: Daily-challenge task or chest rewards, incomplete activities, zero-XP results, or XP recorded on another local date.',
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
          'Do this: Play a course lesson or Skill Builder video until its reported playback progress reaches at least 80%.\n\nWhen it records: After an 80% or higher progress update is saved successfully.\n\nWon’t count: Only opening the video, stopping below 80%, offline progress that never syncs, or watching an unrelated video outside these learning areas.',
        targetValue: 80,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.COMPLETE_CHAPTER_QUIZ_AFTER_VIDEO,
        title: 'Complete a Chapter Quiz After Its Video',
        details:
          'Do this: Meet a chapter quiz’s video-watch requirement, then complete and submit that same chapter’s quiz. A video requirement completed earlier still qualifies.\n\nWhen it records: At quiz submission, when the saved video progress meets that quiz’s unlock percentage.\n\nWon’t count: A quiz from another chapter, an unfinished quiz, a lesson with no qualifying video, or video progress below the quiz’s requirement.',
        targetValue: 1,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.LEARN_VERBS,
        title: 'Learn 3 New Verbs',
        details:
          'Do this: In Practice Hub, choose three Important Verbs you have never reviewed and tap a pronunciation audio button for each one.\n\nWhen it records: Each verb counts only on its first successful audio-start review.\n\nWon’t count: Previously reviewed verbs, repeated audio on the same verb, only opening the verb page, or audio that fails to start.',
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
          'Do this: In a course quiz, open a Listen and Assemble audio question, arrange the words in the correct order, and submit the correct answer.\n\nWhen it records: After that question’s correct answer is checked and saved.\n\nWon’t count: An incorrect sequence, a Listening multiple-choice question, only playing the audio, or leaving without submitting the answer.',
        targetValue: 1,
        rewardXp: 10,
      },
      {
        key: DailyChallengeTaskKey.LISTENING_MCQ_CORRECT,
        title: 'Answer 3 Listening Questions Correctly',
        details:
          'Do this: Correctly answer three Listening multiple-choice questions that include audio. They may come from more than one course quiz today.\n\nWhen it records: Each correct answer counts after that answer is checked and saved.\n\nWon’t count: Text-only multiple choice, the separate True/False format, wrong answers, only playing the audio, or leaving without submitting an answer.',
        targetValue: 3,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.LISTEN_TRACKS_HUB,
        title: 'Listen to 5 Audio Tracks in the Practice Hub',
        details:
          'Do this: Complete five eligible audio actions in Practice Hub using Important Verb pronunciation or unlearned Skill Builder sentences.\n\nWhen it records: Important Verb audio counts after it starts successfully; a Skill Builder sentence counts after its speech finishes and the review saves.\n\nWon’t count: Only opening a page, failed verb audio, stopping sentence speech early, replaying an already learned sentence, or course lesson audio outside Practice Hub.',
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
          'Do this: Keep eligible learning screens visible in the foreground for a total of 15 minutes today. These include lessons, PDFs, quizzes, exams, vocabulary, Practice Hub, AI Tutor, and live webinars.\n\nWhen it records: Foreground time syncs about every five minutes and when you leave a tracked screen or background the app; completed full minutes are shown.\n\nWon’t count: Home or other untracked screens, time while the app is backgrounded or the device is locked, failed uploads that have not synced yet, or time from another local date.',
        targetValue: 15,
        rewardXp: 15,
      },
      {
        key: DailyChallengeTaskKey.REVIEW_VOCAB_WORDS,
        title: 'Review 20 Vocabulary Words',
        details:
          'Do this: Open lesson Vocabulary and respond to 20 flashcards using “I Know” or “Study Again.” You may continue across multiple sessions today.\n\nWhen it records: Each card counts after its response request succeeds; completing the whole session is not required for this challenge.\n\nWon’t count: Only viewing or flipping a word, browsing the vocabulary list, or leaving a card without selecting a response.',
        targetValue: 20,
        rewardXp: 20,
      },
      {
        key: DailyChallengeTaskKey.EARN_XP_100,
        title: 'Earn 100 XP Today',
        details:
          'Do this: Earn 100 eligible XP today by completing lessons, quizzes, or other XP-awarding learning activities.\n\nWhen it records: The challenge reads today’s saved XP transactions and updates automatically.\n\nWon’t count: Daily-challenge task or chest rewards, incomplete activities, zero-XP results, or XP recorded on another local date.',
        targetValue: 100,
        rewardXp: 50,
      },
    ],
  },
];
