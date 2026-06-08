import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';

import { Lesson, LessonStatus } from '../../lessons/entities/lesson.entity';
import {
  CreateQuizDto,
  CreateQuizQuestionDto,
  QuizAcceptedAnswerDto,
  QuizMatchingPairDto,
  QuizQuestionOptionDto,
  QuizSequenceItemDto,
  UpdateQuizDto,
  UpdateQuizQuestionDto,
} from '../dto/admin-quiz.dto';
import { QuizAcceptedAnswer } from '../entities/quiz-accepted-answer.entity';
import { QuizMatchingPair } from '../entities/quiz-matching-pair.entity';
import { QuizQuestionOption } from '../entities/quiz-question-option.entity';
import {
  QuizQuestion,
  QuizQuestionStatus,
} from '../entities/quiz-question.entity';
import { QuizSequenceItem } from '../entities/quiz-sequence-item.entity';
import { Quiz, QuizStatus } from '../entities/quiz.entity';
import { QuizQuestionFormat } from '../types/quiz-question-format.type';

interface PreparedQuestionPayload {
  questionType: QuizQuestionFormat;
  title?: string | null;
  promptText?: string | null;
  helperText?: string | null;
  translationText?: string | null;
  mediaFileId?: string | null;
  generatedAudioText?: string | null;
  correctBoolean?: boolean;
  points?: number;
  sortOrder?: number;
  status?: QuizQuestionStatus;
  options?: QuizQuestionOptionDto[];
  pairs?: QuizMatchingPairDto[];
  sequenceItems?: QuizSequenceItemDto[];
  acceptedAnswers?: QuizAcceptedAnswerDto[];
}

@Injectable()
export class AdminQuizzesService {
  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,

    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,

    @InjectRepository(QuizQuestion)
    private readonly questionRepository: Repository<QuizQuestion>,
  ) {}

  async createQuiz(lessonId: string, dto: CreateQuizDto) {
    const lesson = await this.getLessonById(lessonId);

    const existingQuiz = await this.quizRepository.findOne({
      where: {
        lessonId: lesson.id,
      },
    });

    if (existingQuiz && existingQuiz.status !== QuizStatus.ARCHIVED) {
      throw new ConflictException('This lesson already has an active quiz');
    }

    const quiz = this.quizRepository.create({
      courseId: lesson.courseId,
      chapterId: lesson.chapterId,
      lessonId: lesson.id,
      title: dto.title?.trim() || `${lesson.title} Quiz`,
      description: dto.description ?? null,
      totalQuestions: 0,
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status ?? QuizStatus.DRAFT,
    });

    const savedQuiz = await this.quizRepository.save(quiz);

    return this.findQuizById(savedQuiz.id);
  }

  async findQuizzesByLesson(lessonId: string) {
    await this.getLessonById(lessonId);

    return this.quizRepository.find({
      where: {
        lessonId,
      },
      order: {
        sortOrder: 'ASC',
        createdAt: 'DESC',
      },
      relations: {
        questions: true,
      },
    });
  }

  async findQuizById(quizId: string) {
    const quiz = await this.quizRepository.findOne({
      where: {
        id: quizId,
      },
      relations: {
        lesson: true,
        questions: {
          options: true,
          pairs: true,
          sequenceItems: true,
          acceptedAnswers: true,
        },
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    quiz.questions = this.sortQuestions(quiz.questions ?? []);

    return quiz;
  }

  async updateQuiz(quizId: string, dto: UpdateQuizDto) {
    const quiz = await this.getQuizById(quizId);

    if (dto.title !== undefined) {
      quiz.title = dto.title.trim();
    }

    if (dto.description !== undefined) {
      quiz.description = dto.description ?? null;
    }

    if (dto.sortOrder !== undefined) {
      quiz.sortOrder = dto.sortOrder;
    }

    if (dto.status !== undefined) {
      quiz.status = dto.status;
    }

    await this.quizRepository.save(quiz);

    return this.findQuizById(quiz.id);
  }

  async publishQuiz(quizId: string) {
    const quiz = await this.findQuizById(quizId);

    const activeQuestions = quiz.questions.filter(
      (question) => question.status !== QuizQuestionStatus.ARCHIVED,
    );

    if (activeQuestions.length === 0) {
      throw new BadRequestException('Quiz must have at least one question');
    }

    quiz.status = QuizStatus.PUBLISHED;
    quiz.totalQuestions = activeQuestions.length;

    await this.quizRepository.save(quiz);

    return this.findQuizById(quiz.id);
  }

  async unpublishQuiz(quizId: string) {
    const quiz = await this.getQuizById(quizId);

    quiz.status = QuizStatus.DRAFT;
    await this.quizRepository.save(quiz);

    return this.findQuizById(quiz.id);
  }

  async archiveQuiz(quizId: string) {
    const quiz = await this.getQuizById(quizId);

    quiz.status = QuizStatus.ARCHIVED;
    await this.quizRepository.save(quiz);

    return {
      message: 'Quiz archived successfully',
    };
  }

  async createQuestion(quizId: string, dto: CreateQuizQuestionDto) {
    const quiz = await this.getQuizById(quizId);
    const payload = this.prepareQuestionPayload(dto.questionType, dto);

    this.validateQuestionPayload(payload);

    const savedQuestion = await this.dataSource.transaction(async (manager) => {
      const questionRepository = manager.getRepository(QuizQuestion);

      const question = questionRepository.create({
        quizId: quiz.id,
        questionType: payload.questionType,
        title: payload.title ?? null,
        promptText: payload.promptText ?? null,
        helperText: payload.helperText ?? null,
        translationText: payload.translationText ?? null,
        mediaFileId: payload.mediaFileId ?? null,
        generatedAudioText: payload.generatedAudioText ?? null,
        points: payload.points ?? 1,
        sortOrder: payload.sortOrder ?? 0,
        status: payload.status ?? QuizQuestionStatus.DRAFT,
      });

      const createdQuestion = await questionRepository.save(question);

      await this.replaceQuestionChildren(manager, createdQuestion.id, payload);
      await this.refreshQuizQuestionCount(manager, quiz.id);

      return createdQuestion;
    });

    return this.findQuestionById(savedQuestion.id);
  }

  async findQuestionsByQuiz(quizId: string) {
    await this.getQuizById(quizId);

    const questions = await this.questionRepository.find({
      where: {
        quizId,
      },
      relations: {
        options: true,
        pairs: true,
        sequenceItems: true,
        acceptedAnswers: true,
      },
      order: {
        sortOrder: 'ASC',
        createdAt: 'ASC',
      },
    });

    return this.sortQuestions(questions);
  }

  async findQuestionById(questionId: string) {
    const question = await this.questionRepository.findOne({
      where: {
        id: questionId,
      },
      relations: {
        options: true,
        pairs: true,
        sequenceItems: true,
        acceptedAnswers: true,
      },
    });

    if (!question) {
      throw new NotFoundException('Quiz question not found');
    }

    this.sortQuestionChildren(question);

    return question;
  }

  async updateQuestion(questionId: string, dto: UpdateQuizQuestionDto) {
    const question = await this.findQuestionById(questionId);

    const nextType = dto.questionType ?? question.questionType;
    const payload = this.prepareQuestionPayload(nextType, {
      questionType: nextType,
      title: dto.title !== undefined ? dto.title : question.title,
      promptText:
        dto.promptText !== undefined ? dto.promptText : question.promptText,
      helperText:
        dto.helperText !== undefined ? dto.helperText : question.helperText,
      translationText:
        dto.translationText !== undefined
          ? dto.translationText
          : question.translationText,
      mediaFileId:
        dto.mediaFileId !== undefined ? dto.mediaFileId : question.mediaFileId,
      generatedAudioText:
        dto.generatedAudioText !== undefined
          ? dto.generatedAudioText
          : question.generatedAudioText,
      correctBoolean: dto.correctBoolean,
      points: dto.points ?? question.points,
      sortOrder: dto.sortOrder ?? question.sortOrder,
      status: dto.status ?? question.status,
      options: dto.options ?? this.mapOptionsToDto(question.options ?? []),
      pairs: dto.pairs ?? this.mapPairsToDto(question.pairs ?? []),
      sequenceItems:
        dto.sequenceItems ??
        this.mapSequenceItemsToDto(question.sequenceItems ?? []),
      acceptedAnswers:
        dto.acceptedAnswers ??
        this.mapAcceptedAnswersToDto(question.acceptedAnswers ?? []),
    });

    this.validateQuestionPayload(payload);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(QuizQuestion).save({
        id: question.id,
        questionType: payload.questionType,
        title: payload.title ?? null,
        promptText: payload.promptText ?? null,
        helperText: payload.helperText ?? null,
        translationText: payload.translationText ?? null,
        mediaFileId: payload.mediaFileId ?? null,
        generatedAudioText: payload.generatedAudioText ?? null,
        points: payload.points ?? 1,
        sortOrder: payload.sortOrder ?? 0,
        status: payload.status ?? QuizQuestionStatus.DRAFT,
      });

      await this.replaceQuestionChildren(manager, question.id, payload);
      await this.refreshQuizQuestionCount(manager, question.quizId);
    });

    return this.findQuestionById(question.id);
  }

  async archiveQuestion(questionId: string) {
    const question = await this.findQuestionById(questionId);

    question.status = QuizQuestionStatus.ARCHIVED;
    await this.questionRepository.save(question);

    await this.dataSource.transaction(async (manager) => {
      await this.refreshQuizQuestionCount(manager, question.quizId);
    });

    return {
      message: 'Quiz question archived successfully',
    };
  }

  private async getLessonById(lessonId: string) {
    const lesson = await this.lessonRepository.findOne({
      where: {
        id: lessonId,
      },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    return lesson;
  }

  private async getQuizById(quizId: string) {
    const quiz = await this.quizRepository.findOne({
      where: {
        id: quizId,
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    return quiz;
  }

  private prepareQuestionPayload(
    questionType: QuizQuestionFormat,
    payload: PreparedQuestionPayload,
  ): PreparedQuestionPayload {
    if (
      questionType === QuizQuestionFormat.TRUE_FALSE &&
      typeof payload.correctBoolean === 'boolean' &&
      (!payload.options || payload.options.length === 0)
    ) {
      return {
        ...payload,
        questionType,
        options: [
          {
            optionText: 'False',
            isCorrect: payload.correctBoolean === false,
            sortOrder: 1,
          },
          {
            optionText: 'True',
            isCorrect: payload.correctBoolean === true,
            sortOrder: 2,
          },
        ],
      };
    }

    return {
      ...payload,
      questionType,
    };
  }

  private validateQuestionPayload(payload: PreparedQuestionPayload) {
    switch (payload.questionType) {
      case QuizQuestionFormat.LISTENING_MCQ:
        this.requireText(payload.promptText, 'Main title is required');
        this.requireAudio(payload);
        this.validateSingleCorrectOption(payload.options, 2);
        break;

      case QuizQuestionFormat.WORD_TRANSLATION:
        this.requireText(payload.promptText, 'Main question text is required');
        this.validateSingleCorrectOption(payload.options, 2);
        break;

      case QuizQuestionFormat.SENTENCE_TRANSLATION:
        this.requireText(payload.promptText, 'Sentence text is required');
        this.validateSequenceItems(payload.sequenceItems);
        break;

      case QuizQuestionFormat.TRUE_FALSE:
        this.requireText(payload.promptText, 'Question text is required');
        this.validateSingleCorrectOption(payload.options, 2);
        break;

      case QuizQuestionFormat.FILL_IN_THE_BLANKS:
        this.requireText(payload.promptText, 'Sentence with blank is required');
        this.validateSingleCorrectOption(payload.options, 2);
        break;

      case QuizQuestionFormat.LISTEN_AND_ASSEMBLE:
        this.requireAudio(payload);
        this.requireText(
          payload.promptText,
          'Sentence to assemble is required',
        );
        this.validateSequenceItems(payload.sequenceItems);
        break;

      case QuizQuestionFormat.MATCH_THE_PAIR:
        this.validatePairs(payload.pairs);
        break;

      case QuizQuestionFormat.WRITING_WORD_TRANSLATION:
        this.requireText(payload.helperText, 'English helper text is required');
        this.validateAcceptedAnswers(payload.acceptedAnswers);
        break;

      case QuizQuestionFormat.IDENTIFY_IMAGE:
        this.requireFile(payload.mediaFileId, 'Question image is required');
        this.validateSingleCorrectOption(payload.options, 2);
        break;

      default:
        throw new BadRequestException('Invalid question format');
    }
  }

  private requireText(value: string | null | undefined, message: string) {
    if (!value || value.trim().length === 0) {
      throw new BadRequestException(message);
    }
  }

  private requireFile(value: string | null | undefined, message: string) {
    if (!value) {
      throw new BadRequestException(message);
    }
  }

  private requireAudio(payload: PreparedQuestionPayload) {
    if (!payload.mediaFileId && !payload.generatedAudioText) {
      throw new BadRequestException(
        'Audio file or generated audio text is required',
      );
    }
  }

  private validateSingleCorrectOption(
    options: QuizQuestionOptionDto[] | undefined,
    minOptions: number,
  ) {
    if (!options || options.length < minOptions) {
      throw new BadRequestException(
        `At least ${minOptions} answer options are required`,
      );
    }

    const correctCount = options.filter((option) => option.isCorrect).length;

    if (correctCount !== 1) {
      throw new BadRequestException('Exactly one correct option is required');
    }
  }

  private validateSequenceItems(items: QuizSequenceItemDto[] | undefined) {
    if (!items || items.length < 2) {
      throw new BadRequestException('At least two sequence words are required');
    }

    const requiredItems = items.filter((item) => item.isRequired !== false);

    if (requiredItems.length < 2) {
      throw new BadRequestException(
        'At least two required sequence words are required',
      );
    }
  }

  private validatePairs(pairs: QuizMatchingPairDto[] | undefined) {
    if (!pairs || pairs.length < 2) {
      throw new BadRequestException('At least two matching pairs are required');
    }
  }

  private validateAcceptedAnswers(
    acceptedAnswers: QuizAcceptedAnswerDto[] | undefined,
  ) {
    if (!acceptedAnswers || acceptedAnswers.length === 0) {
      throw new BadRequestException('At least one accepted answer is required');
    }

    const primaryCount = acceptedAnswers.filter(
      (answer) => answer.isPrimary,
    ).length;

    if (primaryCount > 1) {
      throw new BadRequestException('Only one primary answer is allowed');
    }
  }

  private async replaceQuestionChildren(
    manager: EntityManager,
    questionId: string,
    payload: PreparedQuestionPayload,
  ) {
    await manager.getRepository(QuizQuestionOption).delete({ questionId });
    await manager.getRepository(QuizMatchingPair).delete({ questionId });
    await manager.getRepository(QuizSequenceItem).delete({ questionId });
    await manager.getRepository(QuizAcceptedAnswer).delete({ questionId });

    if (payload.options?.length) {
      const rows = payload.options.map((option, index) =>
        manager.getRepository(QuizQuestionOption).create({
          questionId,
          optionText: option.optionText.trim(),
          isCorrect: option.isCorrect ?? false,
          sortOrder: option.sortOrder ?? index + 1,
        }),
      );

      await manager.getRepository(QuizQuestionOption).save(rows);
    }

    if (payload.pairs?.length) {
      const rows = payload.pairs.map((pair, index) =>
        manager.getRepository(QuizMatchingPair).create({
          questionId,
          leftText: pair.leftText.trim(),
          rightText: pair.rightText.trim(),
          leftLabel: pair.leftLabel ?? null,
          rightLabel: pair.rightLabel ?? null,
          sortOrder: pair.sortOrder ?? index + 1,
        }),
      );

      await manager.getRepository(QuizMatchingPair).save(rows);
    }

    if (payload.sequenceItems?.length) {
      const rows = payload.sequenceItems.map((item, index) =>
        manager.getRepository(QuizSequenceItem).create({
          questionId,
          wordText: item.wordText.trim(),
          isRequired: item.isRequired ?? true,
          sortOrder: item.sortOrder ?? index + 1,
        }),
      );

      await manager.getRepository(QuizSequenceItem).save(rows);
    }

    if (payload.acceptedAnswers?.length) {
      const rows = payload.acceptedAnswers.map((answer, index) =>
        manager.getRepository(QuizAcceptedAnswer).create({
          questionId,
          answerText: answer.answerText.trim(),
          isPrimary: answer.isPrimary ?? index === 0,
          sortOrder: answer.sortOrder ?? index + 1,
        }),
      );

      await manager.getRepository(QuizAcceptedAnswer).save(rows);
    }
  }

  private async refreshQuizQuestionCount(
    manager: EntityManager,
    quizId: string,
  ) {
    const totalQuestions = await manager.getRepository(QuizQuestion).count({
      where: {
        quizId,
        status: Not(QuizQuestionStatus.ARCHIVED),
      },
    });

    await manager.getRepository(Quiz).update(
      {
        id: quizId,
      },
      {
        totalQuestions,
      },
    );
  }

  private sortQuestions(questions: QuizQuestion[]) {
    const sortedQuestions = questions
      .map((question) => this.sortQuestionChildren(question))
      .sort((firstQuestion, secondQuestion) => {
        if (firstQuestion.sortOrder !== secondQuestion.sortOrder) {
          return firstQuestion.sortOrder - secondQuestion.sortOrder;
        }

        return (
          firstQuestion.createdAt.getTime() - secondQuestion.createdAt.getTime()
        );
      });

    return sortedQuestions;
  }

  private sortQuestionChildren(question: QuizQuestion) {
    question.options = (question.options ?? []).sort(
      (first, second) => first.sortOrder - second.sortOrder,
    );

    question.pairs = (question.pairs ?? []).sort(
      (first, second) => first.sortOrder - second.sortOrder,
    );

    question.sequenceItems = (question.sequenceItems ?? []).sort(
      (first, second) => first.sortOrder - second.sortOrder,
    );

    question.acceptedAnswers = (question.acceptedAnswers ?? []).sort(
      (first, second) => first.sortOrder - second.sortOrder,
    );

    return question;
  }

  private mapOptionsToDto(options: QuizQuestionOption[]) {
    return options.map((option) => ({
      optionText: option.optionText,
      isCorrect: option.isCorrect,
      sortOrder: option.sortOrder,
    }));
  }

  private mapPairsToDto(pairs: QuizMatchingPair[]) {
    return pairs.map((pair) => ({
      leftText: pair.leftText,
      rightText: pair.rightText,
      leftLabel: pair.leftLabel ?? undefined,
      rightLabel: pair.rightLabel ?? undefined,
      sortOrder: pair.sortOrder,
    }));
  }

  private mapSequenceItemsToDto(items: QuizSequenceItem[]) {
    return items.map((item) => ({
      wordText: item.wordText,
      isRequired: item.isRequired,
      sortOrder: item.sortOrder,
    }));
  }

  private mapAcceptedAnswersToDto(answers: QuizAcceptedAnswer[]) {
    return answers.map((answer) => ({
      answerText: answer.answerText,
      isPrimary: answer.isPrimary,
      sortOrder: answer.sortOrder,
    }));
  }
}
