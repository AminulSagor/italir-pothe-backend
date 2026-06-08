import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

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
  ) {}

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

    const questions = await this.findActiveQuestions(quiz.id);

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

    const result = this.calculateResult(
      session,
      questions,
      dto.totalTimeSeconds,
    );

    session.status = QuizSessionStatus.SUBMITTED;
    session.correctAnswers = result.correctAnswers;
    session.score = result.scorePercentage;
    session.earnedXp = result.earnedXp;
    session.submittedAt = new Date();

    await this.sessionRepository.save(session);

    return result;
  }

  async getSessionResult(
    sessionId: string,
    user: QuizRequestUser,
  ): Promise<QuizSessionResultResponse> {
    const session = await this.getSessionForUser(sessionId, user.id, [
      'answers',
    ]);

    if (session.status !== QuizSessionStatus.SUBMITTED) {
      throw new BadRequestException('Quiz session is not submitted yet');
    }

    const questions = await this.findActiveQuestions(session.quizId);
    const elapsedSeconds = this.calculateElapsedSeconds(session);

    return this.calculateResult(session, questions, elapsedSeconds);
  }

  private async getSessionForUser(
    sessionId: string,
    userId: string,
    relations: string[] = [],
  ): Promise<QuizSession> {
    const session = await this.sessionRepository.findOne({
      where: {
        id: sessionId,
        userId,
      },
      relations,
    });

    if (!session) {
      throw new UnauthorizedException('Quiz session not found');
    }

    return session;
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
    const answerMap = new Map(
      (session.answers ?? []).map((answer) => [answer.questionId, answer]),
    );

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
