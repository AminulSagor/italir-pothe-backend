export enum QuizQuestionFormat {
  LISTENING_MCQ = 'listening_mcq',
  WORD_TRANSLATION = 'word_translation',
  SENTENCE_TRANSLATION = 'sentence_translation',
  TRUE_FALSE = 'true_false',
  FILL_IN_THE_BLANKS = 'fill_in_the_blanks',
  LISTEN_AND_ASSEMBLE = 'listen_and_assemble',
  MATCH_THE_PAIR = 'match_the_pair',
  WRITING_WORD_TRANSLATION = 'writing_word_translation',
  IDENTIFY_IMAGE = 'identify_image',
}

export type QuizQuestionGradingMode =
  | 'single_option'
  | 'true_false'
  | 'sequence'
  | 'matching'
  | 'free_typing';

export interface QuizQuestionFormatMeta {
  value: QuizQuestionFormat;
  label: string;
  uiSubtitle: string;
  gradingMode: QuizQuestionGradingMode;
}

export const QUIZ_QUESTION_FORMATS: QuizQuestionFormatMeta[] = [
  {
    value: QuizQuestionFormat.LISTENING_MCQ,
    label: 'Listening',
    uiSubtitle: 'Audio Response',
    gradingMode: 'single_option',
  },
  {
    value: QuizQuestionFormat.WORD_TRANSLATION,
    label: 'Word Translation',
    uiSubtitle: 'Word Pick',
    gradingMode: 'single_option',
  },
  {
    value: QuizQuestionFormat.SENTENCE_TRANSLATION,
    label: 'Sentence Translation',
    uiSubtitle: 'Visual Puzzle',
    gradingMode: 'sequence',
  },
  {
    value: QuizQuestionFormat.TRUE_FALSE,
    label: 'True False',
    uiSubtitle: 'Fact Check',
    gradingMode: 'true_false',
  },
  {
    value: QuizQuestionFormat.FILL_IN_THE_BLANKS,
    label: 'Fill in The Blanks',
    uiSubtitle: 'Missing Word',
    gradingMode: 'single_option',
  },
  {
    value: QuizQuestionFormat.LISTEN_AND_ASSEMBLE,
    label: 'Listen & Assemble',
    uiSubtitle: 'Audio Puzzle',
    gradingMode: 'sequence',
  },
  {
    value: QuizQuestionFormat.MATCH_THE_PAIR,
    label: 'Match the Pair',
    uiSubtitle: 'Link Words',
    gradingMode: 'matching',
  },
  {
    value: QuizQuestionFormat.WRITING_WORD_TRANSLATION,
    label: 'Writing Word',
    uiSubtitle: 'Free Typing',
    gradingMode: 'free_typing',
  },
  {
    value: QuizQuestionFormat.IDENTIFY_IMAGE,
    label: 'Identify Image',
    uiSubtitle: 'Visual Pick',
    gradingMode: 'single_option',
  },
];

export const QUIZ_QUESTION_FORMAT_VALUES = QUIZ_QUESTION_FORMATS.map(
  (format) => format.value,
);
