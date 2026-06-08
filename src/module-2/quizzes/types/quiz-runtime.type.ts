import { QuizQuestionFormat } from './quiz-question-format.type';
import { QuizSessionStatus } from '../entities/quiz-session.entity';

export interface QuizRuntimeOption {
  id: string;
  optionText: string;
}

export interface QuizRuntimeSequenceItem {
  id: string;
  wordText: string;
}

export interface QuizRuntimeMatchingLeftItem {
  pairId: string;
  leftText: string;
  leftLabel: string | null;
}

export interface QuizRuntimeMatchingRightItem {
  rightText: string;
  rightLabel: string | null;
}

export interface QuizRuntimeMatchingItems {
  leftItems: QuizRuntimeMatchingLeftItem[];
  rightItems: QuizRuntimeMatchingRightItem[];
}

export interface QuizRuntimeQuestion {
  id: string;
  questionType: QuizQuestionFormat;
  title: string | null;
  promptText: string | null;
  helperText: string | null;
  translationText: string | null;
  mediaFileId: string | null;
  generatedAudioText: string | null;
  points: number;
  sortOrder: number;
  answered: boolean;
  isCorrect: boolean | null;
  options: QuizRuntimeOption[];
  sequenceItems: QuizRuntimeSequenceItem[];
  matchingItems: QuizRuntimeMatchingItems | null;
}

export interface QuizSessionResponse {
  id: string;
  quizId: string;
  lessonId: string;
  status: QuizSessionStatus;
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number;
  score: number;
  earnedXp: number;
  startedAt: Date | null;
  submittedAt: Date | null;
  questions: QuizRuntimeQuestion[];
}

export interface QuizCorrectAnswerResponse {
  optionId?: string;
  optionText?: string;
  answerText?: string;
  sequenceText?: string;
  pairs?: {
    leftText: string;
    rightText: string;
  }[];
}

export interface CheckQuizAnswerResponse {
  sessionId: string;
  questionId: string;
  isCorrect: boolean;
  correctAnswer: QuizCorrectAnswerResponse;
  meaning: string | null;
  explanation: string | null;
}

export interface QuizScoringBreakdown {
  baseXp: number;
  comboBonus: number;
  masteryBonus: number;
  fastFinishBonus: number;
  totalXp: number;
  longestStreak: number;
  fastFinishTargetSeconds: number;
  totalTimeSeconds: number;
  fastFinishAchieved: boolean;
}

export interface QuizSessionResultResponse {
  sessionId: string;
  quizId: string;
  lessonId: string;
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  scorePercentage: number;
  earnedXp: number;
  scoring: QuizScoringBreakdown;
}
