import { Injectable } from '@nestjs/common';

import {
  QuizScoringBreakdown,
  QuizSessionResultResponse,
} from '../types/quiz-runtime.type';

interface GradingQuestionInput {
  id: string;
  sortOrder: number;
}

interface GradingAnswerInput {
  questionId: string;
  isCorrect: boolean;
  timeSpentSeconds: number | null;
}

interface CalculateQuizResultInput {
  sessionId: string;
  quizId: string;
  lessonId: string;
  questions: GradingQuestionInput[];
  answers: GradingAnswerInput[];
  totalTimeSeconds?: number;
}

@Injectable()
export class QuizGradingService {
  private readonly xpPerCorrectAnswer = 10;
  private readonly threeStreakBonus = 5;
  private readonly fiveStreakBonus = 10;
  private readonly masteryBonus = 20;
  private readonly fastFinishBonus = 15;
  private readonly fastFinishSecondsPerQuestion = 13;

  calculateResult(input: CalculateQuizResultInput): QuizSessionResultResponse {
    const orderedQuestions = [...input.questions].sort(
      (first, second) => first.sortOrder - second.sortOrder,
    );

    const answerMap = new Map(
      input.answers.map((answer) => [answer.questionId, answer]),
    );

    const totalQuestions = orderedQuestions.length;
    const correctAnswers = orderedQuestions.filter((question) => {
      return answerMap.get(question.id)?.isCorrect === true;
    }).length;

    const wrongAnswers = totalQuestions - correctAnswers;
    const scorePercentage =
      totalQuestions > 0
        ? Number(((correctAnswers / totalQuestions) * 100).toFixed(2))
        : 0;

    const totalTimeSeconds =
      input.totalTimeSeconds ?? this.calculateTotalAnswerTime(input.answers);

    const longestStreak = this.calculateLongestStreak(
      orderedQuestions,
      answerMap,
    );

    const baseXp = correctAnswers * this.xpPerCorrectAnswer;
    const comboBonus = this.calculateComboBonus(longestStreak);
    const masteryBonus =
      totalQuestions > 0 && correctAnswers === totalQuestions
        ? this.masteryBonus
        : 0;

    const fastFinishTargetSeconds =
      totalQuestions * this.fastFinishSecondsPerQuestion;

    const fastFinishAchieved =
      totalQuestions > 0 &&
      totalTimeSeconds > 0 &&
      totalTimeSeconds <= fastFinishTargetSeconds;

    const fastFinishBonus = fastFinishAchieved ? this.fastFinishBonus : 0;

    const totalXp = baseXp + comboBonus + masteryBonus + fastFinishBonus;

    const scoring: QuizScoringBreakdown = {
      baseXp,
      comboBonus,
      masteryBonus,
      fastFinishBonus,
      totalXp,
      longestStreak,
      fastFinishTargetSeconds,
      totalTimeSeconds,
      fastFinishAchieved,
    };

    return {
      sessionId: input.sessionId,
      quizId: input.quizId,
      lessonId: input.lessonId,
      totalQuestions,
      correctAnswers,
      wrongAnswers,
      scorePercentage,
      earnedXp: totalXp,
      scoring,
    };
  }

  private calculateTotalAnswerTime(answers: GradingAnswerInput[]): number {
    return answers.reduce((total, answer) => {
      return total + (answer.timeSpentSeconds ?? 0);
    }, 0);
  }

  private calculateLongestStreak(
    questions: GradingQuestionInput[],
    answerMap: Map<string, GradingAnswerInput>,
  ): number {
    let currentStreak = 0;
    let longestStreak = 0;

    for (const question of questions) {
      const answer = answerMap.get(question.id);

      if (answer?.isCorrect) {
        currentStreak += 1;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    return longestStreak;
  }

  private calculateComboBonus(longestStreak: number): number {
    if (longestStreak >= 5) {
      return this.threeStreakBonus + this.fiveStreakBonus;
    }

    if (longestStreak >= 3) {
      return this.threeStreakBonus;
    }

    return 0;
  }
}
