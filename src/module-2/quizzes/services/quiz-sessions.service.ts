import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

import {
  CheckQuizAnswerDto,
  CompleteQuizSessionDto,
} from '../dto/quiz-session.dto';
import { QuizAcceptedAnswer } from '../entities/quiz-accepted-answer.entity';
import { QuizAttemptAnswerItem } from '../entities/quiz-attempt-answer-item.entity';
import { QuizAttemptAnswer } from '../entities/quiz-attempt-answer.entity';
import { QuizMatchingPair } from '../entities/quiz-matching-pair.entity';
import { QuizQuestionOption } from '../entities/quiz-question-option.entity';
import {
  QuizQuestion,
  QuizQuestionStatus,
} from '../entities/quiz-question.entity';
import { QuizSequenceItem } from '../entities/quiz-sequence-item.entity';
import {
  QuizSession,
  QuizSessionStatus,
} from '../entities/quiz-session.entity';
import { Quiz, QuizStatus } from '../entities/quiz.entity';
import { QuizQuestionFormat } from '../types/quiz-question-format.type';
import {
  CheckQuizAnswerResponse,
  QuizCorrectAnswerResponse,
  QuizRuntimeMatchingItems,
  QuizRuntimeQuestion,
  QuizSessionResponse,
  QuizSessionResultResponse,
} from '../types/quiz-runtime.type';
import { QuizGradingService } from './quiz-grading.service';
import {
  ScoringService,
  XpRewardSummary,
} from 'src/module-2/scoring/services/scoring.service';
import {
  StreakService,
  UserStreakSummary,
} from 'src/module-2/scoring/services/streak.service';
import { DailyChallengesService } from 'src/module-2/daily-challenges/services/daily-challenges.service';
import { LearningActivityType } from 'src/module-2/daily-challenges/types/daily-challenge.type';

interface QuizRequestUser {
  id: string;
}

interface QuestionGradeResult {
  isCorrect: boolean;
  correctAnswer: QuizCorrectAnswerResponse;
}

@Injectable()
export class QuizSessionsService {
  constructor(
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,

    @InjectRepository(QuizQuestion)
    private readonly questionRepository: Repository<QuizQuestion>,

    @InjectRepository(QuizSession)
    private readonly sessionRepository: Repository<QuizSession>,

    @InjectRepository(QuizAttemptAnswer)
    private readonly answerRepository: Repository<QuizAttemptAnswer>,

    @InjectRepository(QuizAttemptAnswerItem)
    private readonly answerItemRepository: Repository<QuizAttemptAnswerItem>,

    private readonly quizGradingService: QuizGradingService,
    private readonly scoringService: ScoringService,
    private readonly streakService: StreakService,
    private readonly dailyChallengesService: DailyChallengesService,
  ) {}

  private readonly logger = new Logger(QuizSessionsService.name);

  async startLessonQuiz(
    lessonId: string,
    user: QuizRequestUser,
  ): Promise<QuizSessionResponse> {
    const quiz = await this.quizRepository.findOne({
      where: {
        lessonId,
        status: QuizStatus.PUBLISHED,
      },
      order: {
        sortOrder: 'ASC',
        createdAt: 'DESC',
      },
    });

    if (!quiz) {
      throw new NotFoundException('Published quiz not found for this lesson');
    }

    const questions = await this.findPublishedQuizQuestions(quiz);

    if (questions.length === 0) {
      throw new BadRequestException('This quiz has no active questions');
    }

    const session = this.sessionRepository.create({
      userId: user.id,
      quizId: quiz.id,
      lessonId,
      status: QuizSessionStatus.IN_PROGRESS,
      totalQuestions: questions.length,
      correctAnswers: 0,
      score: 0,
      earnedXp: 0,
      startedAt: new Date(),
      submittedAt: null,
    });

    const savedSession = await this.sessionRepository.save(session);

    return this.findSessionById(savedSession.id, user);
  }


  async getLessonQuizAvailability(lessonId: string) {
    const quiz = await this.quizRepository.findOne({
      where: {
        lessonId,
        status: QuizStatus.PUBLISHED,
      },
      order: {
        sortOrder: 'ASC',
        createdAt: 'DESC',
      },
    });

    if (!quiz) {
      return {
        lessonId,
        hasQuiz: false,
        quizId: null,
        title: null,
        description: null,
        totalQuestions: 0,
      };
    }

    const questions = await this.findPublishedQuizQuestions(quiz);

    return {
      lessonId,
      hasQuiz: questions.length > 0,
      quizId: quiz.id,
      title: quiz.title,
      description: quiz.description,
      totalQuestions: questions.length,
    };
  }

  async findSessionById(
    sessionId: string,
    user: QuizRequestUser,
  ): Promise<QuizSessionResponse> {
    const session = await this.getSessionForUser(sessionId, user.id, [
      'answers',
      'answers.items',
    ]);

    const questions = await this.findActiveQuestions(session.quizId);

    return this.buildSessionResponse(session, questions);
  }

  async checkAnswer(
    sessionId: string,
    dto: CheckQuizAnswerDto,
    user: QuizRequestUser,
  ): Promise<CheckQuizAnswerResponse> {
    const session = await this.getSessionForUser(sessionId, user.id);

    if (session.status !== QuizSessionStatus.IN_PROGRESS) {
      throw new BadRequestException('This quiz session is already submitted');
    }

    const question = await this.findQuestionForSession(
      dto.questionId,
      session.quizId,
    );

    const existingAnswer = await this.answerRepository.findOne({
      where: {
        sessionId: session.id,
        questionId: question.id,
      },
    });

    if (existingAnswer) {
      throw new BadRequestException('This question has already been answered');
    }

    const gradeResult = this.gradeQuestion(question, dto);

    const attemptAnswer = this.answerRepository.create({
      sessionId: session.id,
      questionId: question.id,
      questionType: question.questionType,
      isCorrect: gradeResult.isCorrect,
      pointsEarned: gradeResult.isCorrect ? question.points : 0,
      timeSpentSeconds: dto.timeSpentSeconds ?? null,
      writtenAnswer: dto.writtenAnswer?.trim() || null,
      selectedOptionId: dto.selectedOptionId ?? null,
    });

    const savedAnswer = await this.answerRepository.save(attemptAnswer);
    const answerItems = this.buildAnswerItems(savedAnswer.id, question, dto);

    if (answerItems.length > 0) {
      await this.answerItemRepository.save(answerItems);
    }

    return {
      sessionId: session.id,
      questionId: question.id,
      isCorrect: gradeResult.isCorrect,
      correctAnswer: gradeResult.correctAnswer,
      meaning: question.translationText,
      explanation: question.helperText,
    };
  }

  async completeSession(
    sessionId: string,
    dto: CompleteQuizSessionDto,
    user: QuizRequestUser,
  ): Promise<QuizSessionResultResponse> {
    const session = await this.getSessionForUser(sessionId, user.id, [
      'answers',
      'lesson',
    ]);

    if (session.status !== QuizSessionStatus.IN_PROGRESS) {
      return this.getSessionResult(sessionId, user);
    }

    const questions = await this.findActiveQuestions(session.quizId);

    if (session.answers.length < questions.length) {
      throw new BadRequestException(
        'Please answer all questions before completing the quiz',
      );
    }

    const totalTimeSeconds =
      dto.totalTimeSeconds ?? this.calculateElapsedSeconds(session) ?? 0;

    const result = this.calculateResult(session, questions, totalTimeSeconds);
    const bonusXp =
      result.scoring.comboBonus +
      result.scoring.masteryBonus +
      result.scoring.fastFinishBonus;

    const reward = await this.scoringService.recordQuizCompletionXp({
      userId: user.id,
      sessionId: session.id,
      lessonId: session.lessonId,
      baseXp: result.scoring.baseXp,
      bonusXp,
      scoringMetadata: {
        totalQuestions: result.totalQuestions,
        correctAnswers: result.correctAnswers,
        wrongAnswers: result.wrongAnswers,
        scorePercentage: result.scorePercentage,
        totalTimeSeconds,
        scoring: result.scoring,
      },
    });

    const streak = await this.streakService.updateDailyStreak(
      user.id,
      dto.clientActivityDate,
    );

    session.status = QuizSessionStatus.SUBMITTED;
    session.correctAnswers = result.correctAnswers;
    session.score = result.scorePercentage;
    session.earnedXp = reward.totalXpEarned;
    session.timeTakenSeconds = totalTimeSeconds;
    session.submittedAt = new Date();

    await this.sessionRepository.save(session);

    await this.recordQuizDailyChallengeActivities({
      userId: user.id,
      session,
      questions,
      totalTimeSeconds,
      result,
      reward,
      clientActivityDate: dto.clientActivityDate,
    });

    return this.buildRewardedResult({
      session,
      result,
      reward,
      streak,
    });
  }

  private async recordQuizDailyChallengeActivities(params: {
    userId: string;
    session: QuizSession;
    questions: QuizQuestion[];
    totalTimeSeconds: number;
    result: QuizSessionResultResponse;
    reward: XpRewardSummary;
    clientActivityDate?: string;
  }) {
    const formatStats = this.buildQuestionFormatStats(
      params.questions,
      params.session.answers ?? [],
    );

    const sourcePrefix = `quiz-session:${params.session.id}`;

    await Promise.all([
      this.dailyChallengesService.recordInternalActivity({
        userId: params.userId,
        activityType: LearningActivityType.QUIZ_COMPLETED,
        sourceId: `${sourcePrefix}:completed`,
        value: 1,
        clientActivityDate: params.clientActivityDate,
      }),

      this.recordIf(
        params.result.scorePercentage >= 80,
        params.userId,
        LearningActivityType.QUIZ_SCORE_80,
        `${sourcePrefix}:score-80`,
        Math.round(params.result.scorePercentage),
        params.clientActivityDate,
      ),

      this.recordIf(
        params.result.scoring.fastFinishAchieved,
        params.userId,
        LearningActivityType.QUIZ_FAST_FINISH_BONUS,
        `${sourcePrefix}:fast-finish`,
        1,
        params.clientActivityDate,
      ),

      this.recordIf(
        params.result.scoring.longestStreak >= 5,
        params.userId,
        LearningActivityType.QUIZ_ANSWER_COMBO,
        `${sourcePrefix}:combo`,
        params.result.scoring.longestStreak,
        params.clientActivityDate,
      ),

      this.recordIf(
        formatStats.fillInTheBlanksCorrect > 0,
        params.userId,
        LearningActivityType.QUIZ_FILL_BLANKS_CORRECT,
        `${sourcePrefix}:fill-blanks`,
        formatStats.fillInTheBlanksCorrect,
        params.clientActivityDate,
      ),

      this.recordIf(
        formatStats.matchPairsPerfect,
        params.userId,
        LearningActivityType.QUIZ_MATCH_PAIRS_PERFECT,
        `${sourcePrefix}:match-pairs-perfect`,
        1,
        params.clientActivityDate,
      ),

      this.recordIf(
        formatStats.audioTranscriptionCorrect > 0,
        params.userId,
        LearningActivityType.QUIZ_AUDIO_TRANSCRIPTION_CORRECT,
        `${sourcePrefix}:audio-transcription`,
        formatStats.audioTranscriptionCorrect,
        params.clientActivityDate,
      ),

      this.recordIf(
        formatStats.trueFalseCorrect > 0,
        params.userId,
        LearningActivityType.QUIZ_TRUE_FALSE_AUDIO_CORRECT,
        `${sourcePrefix}:true-false`,
        formatStats.trueFalseCorrect,
        params.clientActivityDate,
      ),

      this.recordIf(
        formatStats.audioTrackCount > 0,
        params.userId,
        LearningActivityType.AUDIO_TRACK_LISTENED,
        `${sourcePrefix}:audio-tracks`,
        formatStats.audioTrackCount,
        params.clientActivityDate,
      ),

      this.recordIf(
        params.reward.totalXpEarned > 0,
        params.userId,
        LearningActivityType.XP_EARNED,
        `${sourcePrefix}:xp`,
        params.reward.totalXpEarned,
        params.clientActivityDate,
      ),
    ]);
  }

  private async recordIf(
    condition: boolean,
    userId: string,
    activityType: LearningActivityType,
    sourceId: string,
    value: number,
    clientActivityDate?: string,
  ) {
    if (!condition) {
      return;
    }

    await this.dailyChallengesService.recordInternalActivity({
      userId,
      activityType,
      sourceId,
      value,
      clientActivityDate,
    });
  }

  private buildQuestionFormatStats(
    questions: QuizQuestion[],
    answers: QuizAttemptAnswer[],
  ) {
    const answerMap = new Map(
      answers.map((answer) => [answer.questionId, answer]),
    );

    let fillInTheBlanksCorrect = 0;
    let audioTranscriptionCorrect = 0;
    let trueFalseCorrect = 0;
    let audioTrackCount = 0;

    let matchPairTotal = 0;
    let matchPairCorrect = 0;

    for (const question of questions) {
      const answer = answerMap.get(question.id);
      const isCorrect = Boolean(answer?.isCorrect);

      const hasAudio =
        Boolean(question.mediaFileId) || Boolean(question.generatedAudioText);

      if (hasAudio) {
        audioTrackCount += 1;
      }

      if (
        question.questionType === QuizQuestionFormat.FILL_IN_THE_BLANKS &&
        isCorrect
      ) {
        fillInTheBlanksCorrect += 1;
      }

      if (
        question.questionType === QuizQuestionFormat.LISTEN_AND_ASSEMBLE &&
        isCorrect
      ) {
        audioTranscriptionCorrect += 1;
      }

      if (
        question.questionType === QuizQuestionFormat.TRUE_FALSE &&
        isCorrect
      ) {
        trueFalseCorrect += 1;
      }

      if (question.questionType === QuizQuestionFormat.MATCH_THE_PAIR) {
        matchPairTotal += 1;

        if (isCorrect) {
          matchPairCorrect += 1;
        }
      }
    }

    return {
      fillInTheBlanksCorrect,
      audioTranscriptionCorrect,
      trueFalseCorrect,
      audioTrackCount,
      matchPairsPerfect:
        matchPairTotal > 0 && matchPairTotal === matchPairCorrect,
    };
  }

  async getSessionResult(
    sessionId: string,
    user: QuizRequestUser,
  ): Promise<QuizSessionResultResponse> {
    const session = await this.getSessionForUser(sessionId, user.id, [
      'answers',
      'lesson',
    ]);

    if (session.status !== QuizSessionStatus.SUBMITTED) {
      throw new BadRequestException('Quiz session is not submitted yet');
    }

    const questions = await this.findActiveQuestions(session.quizId);
    const totalTimeSeconds =
      session.timeTakenSeconds || this.calculateElapsedSeconds(session) || 0;

    const result = this.calculateResult(session, questions, totalTimeSeconds);
    const reward =
      (await this.scoringService.findQuizCompletionXp(session.id)) ??
      this.buildFallbackReward(result);

    const streak = await this.streakService.getUserStreakSummary(user.id);

    return this.buildRewardedResult({
      session,
      result,
      reward,
      streak,
    });
  }

  async getSessionReview(sessionId: string, user: QuizRequestUser) {
    const session = await this.getSessionForUser(sessionId, user.id, [
      'answers',
      'answers.items',
      'lesson',
    ]);

    if (session.status !== QuizSessionStatus.SUBMITTED) {
      throw new BadRequestException('Quiz session is not submitted yet');
    }

    const questions = await this.findActiveQuestions(session.quizId);
    const answerMap = new Map<string, QuizAttemptAnswer>();

    for (const answer of session.answers ?? []) {
      answerMap.set(answer.questionId, answer);
    }

    return {
      sessionId: session.id,
      quizId: session.quizId,
      lessonId: session.lessonId,
      lessonTitle: session.lesson?.title ?? null,
      totalQuestions: questions.length,
      correctAnswers: session.correctAnswers,
      wrongAnswers: questions.length - session.correctAnswers,
      scorePercentage: Number(session.score ?? 0),
      items: questions.map((question) =>
        this.buildReviewItem(question, answerMap.get(question.id) ?? null),
      ),
    };
  }

  async getSessionShareCard(sessionId: string, user: QuizRequestUser) {
    const result = await this.getSessionResult(sessionId, user);

    return {
      sessionId: result.sessionId,
      title: 'Milestone Reached',
      brandName: 'Italir Pothe',
      headline: result.completedTitle,
      message: result.completedMessage,
      badges: [
        `+${result.totalXpEarned ?? result.earnedXp} XP`,
        `${result.streak?.currentDays ?? 0} Day Streak`,
        `${Math.round(result.accuracyPercent ?? result.scorePercentage)}% Accuracy`,
      ],
      shareText: `${result.completedTitle}! I completed ${result.lessonTitle ?? 'a lesson'} on Italir Pothe with ${Math.round(
        result.accuracyPercent ?? result.scorePercentage,
      )}% accuracy and earned +${result.totalXpEarned ?? result.earnedXp} XP.`,
    };
  }

  private buildRewardedResult(params: {
    session: QuizSession;
    result: QuizSessionResultResponse;
    reward: XpRewardSummary;
    streak: UserStreakSummary;
  }): QuizSessionResultResponse {
    const lessonTitle = params.session.lesson?.title ?? 'Lesson';

    return {
      ...params.result,
      lessonTitle,
      completedTitle: 'Bravissimo!',
      completedMessage: `You completed ${lessonTitle}!`,
      timeTakenSeconds: params.session.timeTakenSeconds,
      accuracyPercent: params.result.scorePercentage,
      earnedXp: params.reward.totalXpEarned,
      baseXp: params.reward.baseXp,
      bonusXp: params.reward.bonusXp,
      boostMultiplier: params.reward.boostMultiplier,
      boostXp: params.reward.boostXp,
      totalXpEarned: params.reward.totalXpEarned,
      xpBoost: params.reward.xpBoost,
      streak: params.streak,
      league: {
        previousRank: null,
        currentRank: null,
        movedUp: false,
      },
    };
  }

  private buildFallbackReward(
    result: QuizSessionResultResponse,
  ): XpRewardSummary {
    const bonusXp =
      result.scoring.comboBonus +
      result.scoring.masteryBonus +
      result.scoring.fastFinishBonus;

    return {
      baseXp: result.scoring.baseXp,
      bonusXp,
      boostMultiplier: 1,
      boostXp: 0,
      totalXpEarned: result.scoring.totalXp,
      xpBoost: {
        isActive: false,
        multiplier: 1,
        remainingSeconds: null,
        expiresAt: null,
      },
    };
  }

  private buildReviewItem(
    question: QuizQuestion,
    answer: QuizAttemptAnswer | null,
  ) {
    const sortedAnswerItems = [...(answer?.items ?? [])].sort(
      (first, second) => {
        return (first.sequenceOrder ?? 0) - (second.sequenceOrder ?? 0);
      },
    );

    return {
      questionId: question.id,
      questionType: question.questionType,
      title: question.title,
      promptText: question.promptText,
      helperText: question.helperText,
      translationText: question.translationText,
      mediaFileId: question.mediaFileId,
      generatedAudioText: question.generatedAudioText,
      points: question.points,
      sortOrder: question.sortOrder,
      isCorrect: answer?.isCorrect ?? false,
      userAnswer: this.buildReviewUserAnswer(
        question,
        answer,
        sortedAnswerItems,
      ),
      correctAnswer: this.buildReviewCorrectAnswer(question),
      options: (question.options ?? []).map((option) => ({
        id: option.id,
        optionText: option.optionText,
        isCorrect: option.isCorrect,
        isSelected: answer?.selectedOptionId === option.id,
      })),
      sequenceItems: (question.sequenceItems ?? []).map((item) => ({
        id: item.id,
        wordText: item.wordText,
        isRequired: item.isRequired,
        sortOrder: item.sortOrder,
        isSelected: sortedAnswerItems.some(
          (answerItem) =>
            this.normalizeAnswerText(answerItem.answerText ?? '') ===
            this.normalizeAnswerText(item.wordText),
        ),
      })),
      matchingPairs: (question.pairs ?? []).map((pair) => ({
        id: pair.id,
        leftText: pair.leftText,
        rightText: pair.rightText,
        leftLabel: pair.leftLabel,
        rightLabel: pair.rightLabel,
        selectedRightText:
          sortedAnswerItems.find((item) => item.pairId === pair.id)
            ?.matchedText ?? null,
      })),
      acceptedAnswers: (question.acceptedAnswers ?? []).map(
        (acceptedAnswer) => ({
          id: acceptedAnswer.id,
          answerText: acceptedAnswer.answerText,
          isPrimary: acceptedAnswer.isPrimary,
        }),
      ),
    };
  }

  private buildReviewUserAnswer(
    question: QuizQuestion,
    answer: QuizAttemptAnswer | null,
    sortedAnswerItems: QuizAttemptAnswerItem[],
  ): Record<string, unknown> | null {
    if (!answer) {
      return null;
    }

    switch (question.questionType) {
      case QuizQuestionFormat.LISTENING_MCQ:
      case QuizQuestionFormat.WORD_TRANSLATION:
      case QuizQuestionFormat.TRUE_FALSE:
      case QuizQuestionFormat.FILL_IN_THE_BLANKS:
      case QuizQuestionFormat.IDENTIFY_IMAGE: {
        const selectedOption = (question.options ?? []).find(
          (option) => option.id === answer.selectedOptionId,
        );

        return {
          selectedOptionId: answer.selectedOptionId,
          selectedOptionText: selectedOption?.optionText ?? null,
        };
      }

      case QuizQuestionFormat.SENTENCE_TRANSLATION:
      case QuizQuestionFormat.LISTEN_AND_ASSEMBLE:
        return {
          sequenceAnswerTexts: sortedAnswerItems
            .map((item) => item.answerText)
            .filter((item): item is string => Boolean(item)),
        };

      case QuizQuestionFormat.MATCH_THE_PAIR:
        return {
          matchingAnswers: sortedAnswerItems.map((item) => ({
            pairId: item.pairId,
            matchedText: item.matchedText,
          })),
        };

      case QuizQuestionFormat.WRITING_WORD_TRANSLATION:
        return {
          writtenAnswer: answer.writtenAnswer,
        };

      default:
        return null;
    }
  }

  private buildReviewCorrectAnswer(
    question: QuizQuestion,
  ): Record<string, unknown> | null {
    switch (question.questionType) {
      case QuizQuestionFormat.LISTENING_MCQ:
      case QuizQuestionFormat.WORD_TRANSLATION:
      case QuizQuestionFormat.TRUE_FALSE:
      case QuizQuestionFormat.FILL_IN_THE_BLANKS:
      case QuizQuestionFormat.IDENTIFY_IMAGE: {
        const correctOption = (question.options ?? []).find(
          (option) => option.isCorrect,
        );

        return {
          optionId: correctOption?.id ?? null,
          optionText: correctOption?.optionText ?? null,
        };
      }

      case QuizQuestionFormat.SENTENCE_TRANSLATION:
      case QuizQuestionFormat.LISTEN_AND_ASSEMBLE: {
        const correctSequence = (question.sequenceItems ?? [])
          .filter((item) => item.isRequired)
          .sort((first, second) => first.sortOrder - second.sortOrder)
          .map((item) => item.wordText);

        return {
          sequenceAnswerTexts: correctSequence,
          sequenceText: correctSequence.join(' '),
        };
      }

      case QuizQuestionFormat.MATCH_THE_PAIR:
        return {
          pairs: (question.pairs ?? []).map((pair) => ({
            pairId: pair.id,
            leftText: pair.leftText,
            rightText: pair.rightText,
          })),
        };

      case QuizQuestionFormat.WRITING_WORD_TRANSLATION: {
        const primaryAnswer =
          (question.acceptedAnswers ?? []).find((answer) => answer.isPrimary) ??
          question.acceptedAnswers?.[0];

        return {
          answerText: primaryAnswer?.answerText ?? null,
          acceptedAnswers: (question.acceptedAnswers ?? []).map(
            (answer) => answer.answerText,
          ),
        };
      }

      default:
        return null;
    }
  }

  private async getSessionForUser(
    sessionId: string,
    userId: string,
    relations: string[] = [],
  ): Promise<QuizSession> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations,
    });

    if (!session) {
      throw new NotFoundException('Quiz session not found');
    }

    if (session.userId !== userId) {
      throw new UnauthorizedException(
        'Quiz session does not belong to this user',
      );
    }

    return session;
  }

  private async findPublishedQuizQuestions(
    quiz: Quiz,
  ): Promise<QuizQuestion[]> {
    const activeQuestions = await this.findActiveQuestions(quiz.id);
    if (activeQuestions.length > 0) {
      return activeQuestions;
    }

    // Compatibility repair for quizzes published before publishing also
    // activated their draft questions. Only repair when no active questions
    // exist, so newly added draft questions are not exposed automatically.
    const legacyQuestions = await this.questionRepository.find({
      where: {
        quizId: quiz.id,
        status: Not(QuizQuestionStatus.ARCHIVED),
      },
      relations: ['options', 'pairs', 'sequenceItems', 'acceptedAnswers'],
      order: {
        sortOrder: 'ASC',
        createdAt: 'ASC',
      },
    });

    if (legacyQuestions.length === 0) {
      return [];
    }

    await this.questionRepository.update(
      {
        quizId: quiz.id,
        status: QuizQuestionStatus.DRAFT,
      },
      {
        status: QuizQuestionStatus.ACTIVE,
      },
    );

    return legacyQuestions.map((question) => {
      question.status = QuizQuestionStatus.ACTIVE;
      return this.sortQuestionRelations(question);
    });
  }

  private async findActiveQuestions(quizId: string): Promise<QuizQuestion[]> {
    const questions = await this.questionRepository.find({
      where: {
        quizId,
        status: QuizQuestionStatus.ACTIVE,
      },
      relations: ['options', 'pairs', 'sequenceItems', 'acceptedAnswers'],
      order: {
        sortOrder: 'ASC',
        createdAt: 'ASC',
      },
    });

    return questions.map((question) => this.sortQuestionRelations(question));
  }

  private async findQuestionForSession(
    questionId: string,
    quizId: string,
  ): Promise<QuizQuestion> {
    const question = await this.questionRepository.findOne({
      where: {
        id: questionId,
        quizId,
        status: QuizQuestionStatus.ACTIVE,
      },
      relations: ['options', 'pairs', 'sequenceItems', 'acceptedAnswers'],
    });

    if (!question) {
      throw new NotFoundException('Quiz question not found');
    }

    return this.sortQuestionRelations(question);
  }

  private sortQuestionRelations(question: QuizQuestion): QuizQuestion {
    question.options = [...(question.options ?? [])].sort(
      (first, second) => first.sortOrder - second.sortOrder,
    );

    question.pairs = [...(question.pairs ?? [])].sort(
      (first, second) => first.sortOrder - second.sortOrder,
    );

    question.sequenceItems = [...(question.sequenceItems ?? [])].sort(
      (first, second) => first.sortOrder - second.sortOrder,
    );

    question.acceptedAnswers = [...(question.acceptedAnswers ?? [])].sort(
      (first, second) => first.sortOrder - second.sortOrder,
    );

    return question;
  }

  private buildSessionResponse(
    session: QuizSession,
    questions: QuizQuestion[],
  ): QuizSessionResponse {
    const answerMap = new Map<string, QuizAttemptAnswer>();

    for (const answer of session.answers ?? []) {
      answerMap.set(answer.questionId, answer);
    }

    return {
      id: session.id,
      quizId: session.quizId,
      lessonId: session.lessonId,
      status: session.status,
      totalQuestions: session.totalQuestions,
      answeredQuestions: answerMap.size,
      correctAnswers: session.correctAnswers,
      score: Number(session.score ?? 0),
      earnedXp: session.earnedXp,
      startedAt: session.startedAt,
      submittedAt: session.submittedAt,
      questions: questions.map((question) => {
        const answer = answerMap.get(question.id);
        return this.buildRuntimeQuestion(question, answer ?? null);
      }),
    };
  }

  private buildRuntimeQuestion(
    question: QuizQuestion,
    answer: QuizAttemptAnswer | null,
  ): QuizRuntimeQuestion {
    return {
      id: question.id,
      questionType: question.questionType,
      title: question.title,
      promptText: question.promptText,
      helperText: question.helperText,
      translationText: question.translationText,
      mediaFileId: question.mediaFileId,
      generatedAudioText: question.generatedAudioText,
      points: question.points,
      sortOrder: question.sortOrder,
      answered: Boolean(answer),
      isCorrect: answer?.isCorrect ?? null,
      options: this.shuffleItems(question.options ?? []).map((option) => ({
        id: option.id,
        optionText: option.optionText,
      })),
      sequenceItems: this.shuffleItems(question.sequenceItems ?? []).map(
        (item) => ({
          id: item.id,
          wordText: item.wordText,
        }),
      ),
      matchingItems: this.buildRuntimeMatchingItems(question.pairs ?? []),
    };
  }

  private buildRuntimeMatchingItems(
    pairs: QuizMatchingPair[],
  ): QuizRuntimeMatchingItems | null {
    if (pairs.length === 0) {
      return null;
    }

    return {
      leftItems: this.shuffleItems(pairs).map((pair) => ({
        pairId: pair.id,
        leftText: pair.leftText,
        leftLabel: pair.leftLabel,
      })),
      rightItems: this.shuffleItems(pairs).map((pair) => ({
        rightText: pair.rightText,
        rightLabel: pair.rightLabel,
      })),
    };
  }

  private gradeQuestion(
    question: QuizQuestion,
    dto: CheckQuizAnswerDto,
  ): QuestionGradeResult {
    switch (question.questionType) {
      case QuizQuestionFormat.LISTENING_MCQ:
      case QuizQuestionFormat.WORD_TRANSLATION:
      case QuizQuestionFormat.TRUE_FALSE:
      case QuizQuestionFormat.FILL_IN_THE_BLANKS:
      case QuizQuestionFormat.IDENTIFY_IMAGE:
        return this.gradeOptionQuestion(question.options ?? [], dto);

      case QuizQuestionFormat.SENTENCE_TRANSLATION:
      case QuizQuestionFormat.LISTEN_AND_ASSEMBLE:
        return this.gradeSequenceQuestion(question.sequenceItems ?? [], dto);

      case QuizQuestionFormat.MATCH_THE_PAIR:
        return this.gradeMatchingQuestion(question.pairs ?? [], dto);

      case QuizQuestionFormat.WRITING_WORD_TRANSLATION:
        return this.gradeWrittenQuestion(question.acceptedAnswers ?? [], dto);

      default:
        throw new BadRequestException('Unsupported quiz question type');
    }
  }

  private gradeOptionQuestion(
    options: QuizQuestionOption[],
    dto: CheckQuizAnswerDto,
  ): QuestionGradeResult {
    if (!dto.selectedOptionId) {
      throw new BadRequestException('Selected option is required');
    }

    const selectedOption = options.find(
      (option) => option.id === dto.selectedOptionId,
    );

    if (!selectedOption) {
      throw new BadRequestException('Selected option is invalid');
    }

    const correctOption = options.find((option) => option.isCorrect);

    if (!correctOption) {
      throw new BadRequestException('Correct option is not configured');
    }

    return {
      isCorrect: selectedOption.isCorrect,
      correctAnswer: {
        optionId: correctOption.id,
        optionText: correctOption.optionText,
      },
    };
  }

  private gradeSequenceQuestion(
    sequenceItems: QuizSequenceItem[],
    dto: CheckQuizAnswerDto,
  ): QuestionGradeResult {
    if (!dto.sequenceAnswerTexts || dto.sequenceAnswerTexts.length === 0) {
      throw new BadRequestException('Sequence answer is required');
    }

    const correctSequence = sequenceItems
      .filter((item) => item.isRequired)
      .sort((first, second) => first.sortOrder - second.sortOrder)
      .map((item) => this.normalizeAnswerText(item.wordText));

    const submittedSequence = dto.sequenceAnswerTexts.map((item) =>
      this.normalizeAnswerText(item),
    );

    const isCorrect =
      correctSequence.length === submittedSequence.length &&
      correctSequence.every((item, index) => item === submittedSequence[index]);

    return {
      isCorrect,
      correctAnswer: {
        sequenceText: correctSequence.join(' '),
      },
    };
  }

  private gradeMatchingQuestion(
    pairs: QuizMatchingPair[],
    dto: CheckQuizAnswerDto,
  ): QuestionGradeResult {
    if (!dto.matchingAnswers || dto.matchingAnswers.length === 0) {
      throw new BadRequestException('Matching answers are required');
    }

    const pairMap = new Map(pairs.map((pair) => [pair.id, pair]));
    const submittedMap = new Map(
      dto.matchingAnswers.map((answer) => [answer.pairId, answer.matchedText]),
    );

    const isCorrect =
      pairs.length === submittedMap.size &&
      pairs.every((pair) => {
        const submittedRightText = submittedMap.get(pair.id);

        return (
          submittedRightText !== undefined &&
          this.normalizeAnswerText(submittedRightText) ===
            this.normalizeAnswerText(pair.rightText)
        );
      });

    return {
      isCorrect,
      correctAnswer: {
        pairs: [...pairMap.values()].map((pair) => ({
          leftText: pair.leftText,
          rightText: pair.rightText,
        })),
      },
    };
  }

  private gradeWrittenQuestion(
    acceptedAnswers: QuizAcceptedAnswer[],
    dto: CheckQuizAnswerDto,
  ): QuestionGradeResult {
    if (!dto.writtenAnswer?.trim()) {
      throw new BadRequestException('Written answer is required');
    }

    if (acceptedAnswers.length === 0) {
      throw new BadRequestException('Accepted answers are not configured');
    }

    const normalizedWrittenAnswer = this.normalizeAnswerText(dto.writtenAnswer);

    const isCorrect = acceptedAnswers.some((answer) => {
      return (
        this.normalizeAnswerText(answer.answerText) === normalizedWrittenAnswer
      );
    });

    const primaryAnswer =
      acceptedAnswers.find((answer) => answer.isPrimary) ?? acceptedAnswers[0];

    return {
      isCorrect,
      correctAnswer: {
        answerText: primaryAnswer.answerText,
      },
    };
  }

  private buildAnswerItems(
    attemptAnswerId: string,
    question: QuizQuestion,
    dto: CheckQuizAnswerDto,
  ): QuizAttemptAnswerItem[] {
    switch (question.questionType) {
      case QuizQuestionFormat.LISTENING_MCQ:
      case QuizQuestionFormat.WORD_TRANSLATION:
      case QuizQuestionFormat.TRUE_FALSE:
      case QuizQuestionFormat.FILL_IN_THE_BLANKS:
      case QuizQuestionFormat.IDENTIFY_IMAGE:
        return dto.selectedOptionId
          ? [
              this.answerItemRepository.create({
                attemptAnswerId,
                optionId: dto.selectedOptionId,
                pairId: null,
                answerText: null,
                matchedText: null,
                sequenceOrder: null,
                isSelected: true,
              }),
            ]
          : [];

      case QuizQuestionFormat.SENTENCE_TRANSLATION:
      case QuizQuestionFormat.LISTEN_AND_ASSEMBLE:
        return (dto.sequenceAnswerTexts ?? []).map((answerText, index) =>
          this.answerItemRepository.create({
            attemptAnswerId,
            optionId: null,
            pairId: null,
            answerText,
            matchedText: null,
            sequenceOrder: index,
            isSelected: true,
          }),
        );

      case QuizQuestionFormat.MATCH_THE_PAIR:
        return (dto.matchingAnswers ?? []).map((answer) =>
          this.answerItemRepository.create({
            attemptAnswerId,
            optionId: null,
            pairId: answer.pairId,
            answerText: null,
            matchedText: answer.matchedText,
            sequenceOrder: null,
            isSelected: true,
          }),
        );

      case QuizQuestionFormat.WRITING_WORD_TRANSLATION:
        return dto.writtenAnswer
          ? [
              this.answerItemRepository.create({
                attemptAnswerId,
                optionId: null,
                pairId: null,
                answerText: dto.writtenAnswer,
                matchedText: null,
                sequenceOrder: null,
                isSelected: true,
              }),
            ]
          : [];

      default:
        return [];
    }
  }

  private calculateResult(
    session: QuizSession,
    questions: QuizQuestion[],
    totalTimeSeconds?: number,
  ): QuizSessionResultResponse {
    return this.quizGradingService.calculateResult({
      sessionId: session.id,
      quizId: session.quizId,
      lessonId: session.lessonId,
      questions: questions.map((question) => ({
        id: question.id,
        sortOrder: question.sortOrder,
      })),
      answers: (session.answers ?? []).map((answer) => ({
        questionId: answer.questionId,
        isCorrect: answer.isCorrect,
        timeSpentSeconds: answer.timeSpentSeconds,
      })),
      totalTimeSeconds,
    });
  }

  private calculateElapsedSeconds(session: QuizSession): number | undefined {
    if (!session.startedAt || !session.submittedAt) {
      return undefined;
    }

    return Math.max(
      0,
      Math.floor(
        (session.submittedAt.getTime() - session.startedAt.getTime()) / 1000,
      ),
    );
  }

  private buildCorrectAnswerText(answer: string | null | undefined): string {
    return this.normalizeAnswerText(answer ?? '');
  }

  private normalizeAnswerText(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFC');
  }

  private shuffleItems<T>(items: T[]): T[] {
    return [...items].sort(() => Math.random() - 0.5);
  }
}
