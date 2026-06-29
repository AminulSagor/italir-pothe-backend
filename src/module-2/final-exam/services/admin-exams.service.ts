import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Not, Repository } from 'typeorm';

import { Course } from 'src/module-2/courses/entities/course.entity';
import { QuizQuestionFormat } from 'src/module-2/quizzes/types/quiz-question-format.type';
import {
  CreateCoreQuizQuestionDto,
  CreateExamTemplateDto,
  CreateListeningMiniMcqQuestionDto,
  ExamListQueryDto,
  FinalExamAcceptedAnswerDto,
  FinalExamMatchingPairDto,
  FinalExamQuestionOptionDto,
  FinalExamSequenceItemDto,
  LinkFinalExamWithCourseDto,
  UpdateCoreQuizQuestionDto,
  UpdateExamTemplateDto,
  UpdateListeningMiniMcqQuestionDto,
  UpsertSpeakingTaskDto,
  UpsertWritingTaskDto,
} from '../dto/admin-exam.dto';
import { ExamAcceptedAnswer } from '../entities/exam-accepted-answer.entity';
import { ExamAttempt } from '../entities/exam-attempt.entity';
import { ExamMatchingPair } from '../entities/exam-matching-pair.entity';
import { ExamQuestionOption } from '../entities/exam-question-option.entity';
import { ExamQuestion } from '../entities/exam-question.entity';
import { ExamSectionRule } from '../entities/exam-section-rule.entity';
import { ExamSection } from '../entities/exam-section.entity';
import { ExamSequenceItem } from '../entities/exam-sequence-item.entity';
import { ExamTemplate } from '../entities/exam-template.entity';
import {
  ExamAudioSourceType,
  ExamQuestionStatus,
  ExamRetakePolicy,
  ExamReviewMode,
  ExamSectionStatus,
  ExamSectionType,
  ExamTemplateStatus,
  FinalExamManualQuestionFormat,
} from '../types/final-exam.type';

interface PreparedQuestionPayload {
  questionType: QuizQuestionFormat;
  title?: string | null;
  promptText?: string | null;
  helperText?: string | null;
  translationText?: string | null;
  mediaFileId?: string | null;
  generatedAudioText?: string | null;
  correctBoolean?: boolean | null;
  points?: number;
  sortOrder?: number;
  status?: ExamQuestionStatus;
  options?: FinalExamQuestionOptionDto[];
  pairs?: FinalExamMatchingPairDto[];
  sequenceItems?: FinalExamSequenceItemDto[];
  acceptedAnswers?: FinalExamAcceptedAnswerDto[];
}

@Injectable()
export class AdminExamsService {
  private readonly coreQuizTargetQuestions = 30;
  private readonly listeningTargetQuestions = 10;

  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(ExamTemplate)
    private readonly examTemplateRepository: Repository<ExamTemplate>,

    @InjectRepository(ExamSection)
    private readonly examSectionRepository: Repository<ExamSection>,

    @InjectRepository(ExamSectionRule)
    private readonly examSectionRuleRepository: Repository<ExamSectionRule>,

    @InjectRepository(ExamQuestion)
    private readonly examQuestionRepository: Repository<ExamQuestion>,

    @InjectRepository(ExamQuestionOption)
    private readonly examQuestionOptionRepository: Repository<ExamQuestionOption>,

    @InjectRepository(ExamMatchingPair)
    private readonly examMatchingPairRepository: Repository<ExamMatchingPair>,

    @InjectRepository(ExamSequenceItem)
    private readonly examSequenceItemRepository: Repository<ExamSequenceItem>,

    @InjectRepository(ExamAcceptedAnswer)
    private readonly examAcceptedAnswerRepository: Repository<ExamAcceptedAnswer>,

    @InjectRepository(ExamAttempt)
    private readonly examAttemptRepository: Repository<ExamAttempt>,

    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
  ) {}

  async createExam(dto: CreateExamTemplateDto) {
    const exam = this.examTemplateRepository.create({
      courseId: null,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      overallPassingPercent: dto.overallPassingPercent ?? 70,
      totalDurationMinutes: dto.totalDurationMinutes ?? 60,
      unlockCompletionPercent: dto.unlockCompletionPercent ?? 80,
      plagiarismMonitorEnabled: dto.plagiarismMonitorEnabled ?? true,
      copyPasteMonitorEnabled: dto.copyPasteMonitorEnabled ?? true,
      resultNotice:
        dto.resultNotice?.trim() ||
        'Your results will be processed within 24–48 hours.',
      resultNoticeBn: dto.resultNoticeBn?.trim() || null,
      status: ExamTemplateStatus.DRAFT,
      publishedAt: null,
      archivedAt: null,
    });

    const savedExam = await this.examTemplateRepository.save(exam);

    await this.ensureDefaultSections(savedExam.id);

    return this.findById(savedExam.id);
  }

  async findAll(query: ExamListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const queryBuilder = this.examTemplateRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.course', 'course')
      .orderBy('exam.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      queryBuilder.andWhere('exam.status = :status', {
        status: query.status,
      });
    }

    if (query.courseId) {
      queryBuilder.andWhere('exam.courseId = :courseId', {
        courseId: query.courseId,
      });
    }

    if (query.linkedOnly === true) {
      queryBuilder.andWhere('exam.courseId IS NOT NULL');
    }

    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;

      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('exam.title ILIKE :search', { search }).orWhere(
            'course.title ILIKE :search',
            { search },
          );
        }),
      );
    }

    const [exams, total] = await queryBuilder.getManyAndCount();
    const questionCounts = await this.getQuestionCountsByExamIds(
      exams.map((exam) => exam.id),
    );

    return {
      items: exams.map((exam) => ({
        id: exam.id,
        title: exam.title,
        status: exam.status,
        courseId: exam.courseId,
        linkedCourseTitle: exam.course?.title ?? null,
        isLinkedToCourse: Boolean(exam.courseId),
        totalQuestions: questionCounts.get(exam.id) ?? 0,
        totalDurationMinutes: exam.totalDurationMinutes,
        overallPassingPercent: exam.overallPassingPercent,
        createdAt: exam.createdAt,
        updatedAt: exam.updatedAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async linkFinalExamWithCourse(
    examTemplateId: string,
    dto: LinkFinalExamWithCourseDto,
  ) {
    const exam = await this.getExamById(examTemplateId);
    const course = await this.getCourseById(dto.courseId);

    if (course.finalExamTemplateId && course.finalExamTemplateId !== exam.id) {
      throw new ConflictException(
        'This course is already linked with another final exam.',
      );
    }

    if (exam.courseId && exam.courseId !== course.id) {
      await this.courseRepository.update(exam.courseId, {
        finalExamTemplateId: null,
      });
    }

    exam.courseId = course.id;

    await this.examTemplateRepository.save(exam);

    await this.courseRepository.update(course.id, {
      finalExamTemplateId: exam.id,
    });

    return this.findById(exam.id);
  }

  async unlinkFinalExamFromCourse(examTemplateId: string) {
    const exam = await this.getExamById(examTemplateId);

    if (!exam.courseId) {
      return this.findById(exam.id);
    }

    const linkedCourseId = exam.courseId;

    exam.courseId = null;

    await this.examTemplateRepository.save(exam);

    await this.courseRepository.update(
      {
        id: linkedCourseId,
        finalExamTemplateId: exam.id,
      },
      {
        finalExamTemplateId: null,
      },
    );

    return this.findById(exam.id);
  }

  async findById(examTemplateId: string) {
    await this.ensureDefaultSections(examTemplateId);

    const exam = await this.examTemplateRepository.findOne({
      where: { id: examTemplateId },
      relations: {
        course: true,
        sections: {
          rule: true,
          questions: {
            options: true,
            pairs: true,
            sequenceItems: true,
            acceptedAnswers: true,
          },
        },
      },
    });

    if (!exam) {
      throw new NotFoundException('Final exam not found');
    }

    exam.sections = this.sortSections(exam.sections ?? []);

    return {
      id: exam.id,
      courseId: exam.courseId,
      courseTitle: exam.course?.title ?? null,
      title: exam.title,
      description: exam.description,
      status: exam.status,
      overallPassingPercent: exam.overallPassingPercent,
      totalDurationMinutes: exam.totalDurationMinutes,
      unlockCompletionPercent: exam.unlockCompletionPercent,
      plagiarismMonitorEnabled: exam.plagiarismMonitorEnabled,
      copyPasteMonitorEnabled: exam.copyPasteMonitorEnabled,
      resultNotice: exam.resultNotice,
      resultNoticeBn: exam.resultNoticeBn,
      publishedAt: exam.publishedAt,
      archivedAt: exam.archivedAt,
      setupProgress: this.buildSetupProgress(exam),
      sections: exam.sections.map((section) =>
        this.buildSectionResponse(section),
      ),
      createdAt: exam.createdAt,
      updatedAt: exam.updatedAt,
    };
  }

  async updateExam(examTemplateId: string, dto: UpdateExamTemplateDto) {
    const exam = await this.getExamById(examTemplateId);

    if (dto.title !== undefined) {
      exam.title = dto.title.trim();
    }

    if (dto.description !== undefined) {
      exam.description = dto.description?.trim() || null;
    }

    if (dto.overallPassingPercent !== undefined) {
      exam.overallPassingPercent = dto.overallPassingPercent;
    }

    if (dto.totalDurationMinutes !== undefined) {
      exam.totalDurationMinutes = dto.totalDurationMinutes;
    }

    if (dto.unlockCompletionPercent !== undefined) {
      exam.unlockCompletionPercent = dto.unlockCompletionPercent;
    }

    if (dto.plagiarismMonitorEnabled !== undefined) {
      exam.plagiarismMonitorEnabled = dto.plagiarismMonitorEnabled;
    }

    if (dto.copyPasteMonitorEnabled !== undefined) {
      exam.copyPasteMonitorEnabled = dto.copyPasteMonitorEnabled;
    }

    if (dto.resultNotice !== undefined) {
      exam.resultNotice = dto.resultNotice?.trim() || null;
    }

    if (dto.resultNoticeBn !== undefined) {
      exam.resultNoticeBn = dto.resultNoticeBn?.trim() || null;
    }

    const savedExam = await this.examTemplateRepository.save(exam);

    return this.findById(savedExam.id);
  }

  async getSetupProgress(examTemplateId: string) {
    const exam = await this.findExamEntityWithSections(examTemplateId);

    return this.buildSetupProgress(exam);
  }

  async createCoreQuizQuestion(
    examTemplateId: string,
    dto: CreateCoreQuizQuestionDto,
  ) {
    const section = await this.getSectionByTypeOrFail(
      examTemplateId,
      ExamSectionType.CORE_QUIZ,
    );

    const existingCount = await this.countSectionQuestions(section.id);

    if (existingCount >= this.coreQuizTargetQuestions) {
      throw new BadRequestException(
        `Core Quiz already has ${this.coreQuizTargetQuestions} questions`,
      );
    }

    const payload = this.prepareQuestionPayload(dto.questionType, dto);
    this.validateQuestionPayload(payload);

    const savedQuestion = await this.dataSource.transaction(async (manager) => {
      const question = manager.getRepository(ExamQuestion).create({
        sectionId: section.id,
        questionFormat: payload.questionType,
        title: payload.title ?? null,
        subtitle: payload.helperText ?? null,
        prompt: payload.promptText ?? null,
        promptBn: payload.translationText ?? null,
        audioFileId: this.resolveAudioFileId(payload),
        imageFileId: this.resolveImageFileId(payload),
        generatedAudioText: payload.generatedAudioText ?? null,
        correctBoolean: payload.correctBoolean ?? null,
        audioSourceType: payload.generatedAudioText
          ? ExamAudioSourceType.AI_VOICE
          : ExamAudioSourceType.MANUAL_UPLOAD,
        points: payload.points ?? 1,
        sortOrder: payload.sortOrder ?? existingCount + 1,
        status: payload.status ?? ExamQuestionStatus.DRAFT,
      });

      const createdQuestion = await manager
        .getRepository(ExamQuestion)
        .save(question);

      await this.replaceQuestionChildren(manager, createdQuestion.id, payload);
      await this.syncSectionQuestionCount(manager, section.id);

      return createdQuestion;
    });

    return this.findQuestionById(savedQuestion.id);
  }

  async createListeningQuestion(
    examTemplateId: string,
    dto: CreateListeningMiniMcqQuestionDto,
  ) {
    const section = await this.getSectionByTypeOrFail(
      examTemplateId,
      ExamSectionType.LISTENING_LAB,
    );

    const existingCount = await this.countSectionQuestions(section.id);

    if (existingCount >= this.listeningTargetQuestions) {
      throw new BadRequestException(
        `Listening Lab already has ${this.listeningTargetQuestions} questions`,
      );
    }

    const payload: PreparedQuestionPayload = {
      questionType: QuizQuestionFormat.LISTENING_MCQ,
      title: dto.questionTitle,
      promptText: dto.questionPrompt,
      mediaFileId: dto.audioFileId ?? null,
      generatedAudioText: dto.generatedAudioText ?? null,
      points: dto.points ?? 1,
      sortOrder: dto.sortOrder ?? existingCount + 1,
      status: ExamQuestionStatus.DRAFT,
      options: dto.options,
    };

    this.validateQuestionPayload(payload);

    const savedQuestion = await this.dataSource.transaction(async (manager) => {
      const question = manager.getRepository(ExamQuestion).create({
        sectionId: section.id,
        questionFormat: QuizQuestionFormat.LISTENING_MCQ,
        title: dto.questionTitle.trim(),
        subtitle:
          'Listen carefully to the audio and choose the correct answer.',
        prompt: dto.questionPrompt.trim(),
        promptBn: null,
        audioFileId: dto.audioFileId ?? null,
        imageFileId: null,
        generatedAudioText: dto.generatedAudioText?.trim() || null,
        correctBoolean: null,
        audioSourceType:
          dto.audioSourceType ??
          (dto.generatedAudioText
            ? ExamAudioSourceType.AI_VOICE
            : ExamAudioSourceType.MANUAL_UPLOAD),
        sortOrder: dto.sortOrder ?? existingCount + 1,
        status: ExamQuestionStatus.DRAFT,
      });

      const createdQuestion = await manager
        .getRepository(ExamQuestion)
        .save(question);

      await this.replaceQuestionChildren(manager, createdQuestion.id, payload);
      await this.syncSectionQuestionCount(manager, section.id);

      return createdQuestion;
    });

    if (dto.lockPlayback !== undefined) {
      await this.upsertSectionRule(section.id, {
        playbackLocked: dto.lockPlayback,
      });
    }

    return this.findQuestionById(savedQuestion.id);
  }

  async upsertWritingTask(examTemplateId: string, dto: UpsertWritingTaskDto) {
    const section = await this.getSectionByTypeOrFail(
      examTemplateId,
      ExamSectionType.WRITING_TASK,
    );

    if (dto.maxWords && dto.minWords && dto.maxWords < dto.minWords) {
      throw new BadRequestException('maxWords cannot be smaller than minWords');
    }

    const question = await this.getSingleManualQuestion(section.id);

    const savedQuestion = await this.examQuestionRepository.save({
      id: question?.id,
      sectionId: section.id,
      questionFormat: FinalExamManualQuestionFormat.WRITING_TASK,
      title: dto.title.trim(),
      subtitle: 'Extended essay response with accent assistance.',
      prompt: dto.instruction.trim(),
      promptBn: dto.titleBn.trim(),
      audioFileId: null,
      imageFileId: null,
      generatedAudioText: null,
      correctBoolean: null,
      audioSourceType: ExamAudioSourceType.MANUAL_UPLOAD,
      sortOrder: 1,
      status: ExamQuestionStatus.DRAFT,
    });

    await this.upsertSectionRule(section.id, {
      accentBarEnabled: dto.italianAccentBarEnabled ?? true,
      minWords: dto.minWords ?? 150,
      maxWords: dto.maxWords ?? 200,
    });

    await this.syncSectionQuestionCountWithoutTransaction(section.id);

    return this.findQuestionById(savedQuestion.id);
  }

  async upsertSpeakingTask(examTemplateId: string, dto: UpsertSpeakingTaskDto) {
    const section = await this.getSectionByTypeOrFail(
      examTemplateId,
      ExamSectionType.SPEAKING_LAB,
    );

    const question = await this.getSingleManualQuestion(section.id);

    const savedQuestion = await this.examQuestionRepository.save({
      id: question?.id,
      sectionId: section.id,
      questionFormat: FinalExamManualQuestionFormat.SPEAKING_TASK,
      title: dto.title.trim(),
      subtitle: 'Audio recording and fluency check.',
      prompt: dto.instruction.trim(),
      promptBn: dto.titleBn.trim(),
      audioFileId: null,
      imageFileId: null,
      generatedAudioText: null,
      correctBoolean: null,
      audioSourceType: ExamAudioSourceType.MANUAL_UPLOAD,
      sortOrder: 1,
      status: ExamQuestionStatus.DRAFT,
    });

    await this.upsertSectionRule(section.id, {
      maxDurationSeconds: dto.maxDurationSeconds ?? 60,
      rerecordPolicy:
        dto.unlimitedRerecords === false
          ? ExamRetakePolicy.ONE_TIME
          : ExamRetakePolicy.UNLIMITED,
    });

    await this.syncSectionQuestionCountWithoutTransaction(section.id);

    return this.findQuestionById(savedQuestion.id);
  }

  async findQuestionsBySectionType(
    examTemplateId: string,
    sectionType: ExamSectionType | `${ExamSectionType}`,
  ) {
    const section = await this.getSectionByTypeOrFail(
      examTemplateId,
      sectionType as ExamSectionType,
    );

    const questions = await this.examQuestionRepository.find({
      where: {
        sectionId: section.id,
        status: Not(ExamQuestionStatus.ARCHIVED),
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

    return questions.map((question) => this.buildQuestionResponse(question));
  }

  async publishCoreQuiz(examTemplateId: string) {
    const section = await this.getSectionByTypeOrFail(
      examTemplateId,
      ExamSectionType.CORE_QUIZ,
    );

    const questions = await this.getNonArchivedQuestions(section.id);

    if (questions.length !== this.coreQuizTargetQuestions) {
      throw new BadRequestException(
        `Core Quiz must have exactly ${this.coreQuizTargetQuestions} questions before publish`,
      );
    }

    await this.activateSectionAndQuestions(section, questions);

    return this.findById(examTemplateId);
  }

  async publishListeningLab(examTemplateId: string) {
    const section = await this.getSectionByTypeOrFail(
      examTemplateId,
      ExamSectionType.LISTENING_LAB,
    );

    const questions = await this.getNonArchivedQuestions(section.id);

    if (questions.length !== this.listeningTargetQuestions) {
      throw new BadRequestException(
        `Listening Lab must have exactly ${this.listeningTargetQuestions} questions before publish`,
      );
    }

    for (const question of questions) {
      const correctOptionCount = (question.options ?? []).filter(
        (option) => option.isCorrect,
      ).length;

      if (correctOptionCount !== 1) {
        throw new BadRequestException(
          'Each Listening Lab question must have exactly one correct answer',
        );
      }
    }

    await this.activateSectionAndQuestions(section, questions);

    return this.findById(examTemplateId);
  }

  async publishExam(examTemplateId: string) {
    const exam = await this.findExamEntityWithSections(examTemplateId);

    this.assertExamCanBePublished(exam);

    await this.examTemplateRepository.update(exam.id, {
      status: ExamTemplateStatus.PUBLISHED,
      publishedAt: new Date(),
      archivedAt: null,
    });

    for (const section of exam.sections) {
      section.status = ExamSectionStatus.ACTIVE;
      await this.examSectionRepository.save(section);

      const questions = await this.getNonArchivedQuestions(section.id);

      for (const question of questions) {
        question.status = ExamQuestionStatus.ACTIVE;
      }

      await this.examQuestionRepository.save(questions);
      await this.syncSectionQuestionCountWithoutTransaction(section.id);
    }

    if (exam.courseId) {
      await this.courseRepository.update(exam.courseId, {
        finalExamTemplateId: exam.id,
      });
    }

    return this.findById(exam.id);
  }

  async archiveExam(examTemplateId: string) {
    await this.getExamById(examTemplateId);

    await this.examTemplateRepository.update(examTemplateId, {
      status: ExamTemplateStatus.ARCHIVED,
      archivedAt: new Date(),
    });

    return {
      message: 'Final exam archived successfully',
      id: examTemplateId,
    };
  }

  async hardDeleteExam(examTemplateId: string) {
    const exam = await this.getExamById(examTemplateId);

    const attemptCount = await this.examAttemptRepository.count({
      where: {
        examTemplateId: exam.id,
      },
    });

    if (attemptCount > 0) {
      throw new BadRequestException(
        'Final exam cannot be hard deleted because students already have exam attempts. Archive it instead.',
      );
    }

    await this.examTemplateRepository.delete(exam.id);

    return {
      message: 'Final exam permanently deleted successfully',
      id: exam.id,
    };
  }

  async findQuestionById(questionId: string) {
    const question = await this.examQuestionRepository.findOne({
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
      throw new NotFoundException('Exam question not found');
    }

    return this.buildQuestionResponse(question);
  }

  async updateQuestion(questionId: string, dto: UpdateCoreQuizQuestionDto) {
    const question = await this.examQuestionRepository.findOne({
      where: { id: questionId },
      relations: {
        options: true,
        pairs: true,
        sequenceItems: true,
        acceptedAnswers: true,
      },
    });

    if (!question) {
      throw new NotFoundException('Exam question not found');
    }

    if (
      question.questionFormat === FinalExamManualQuestionFormat.WRITING_TASK ||
      question.questionFormat === FinalExamManualQuestionFormat.SPEAKING_TASK
    ) {
      throw new BadRequestException(
        'Use writing-task or speaking-task setup endpoint for manual final exam tasks',
      );
    }

    const nextType =
      dto.questionType ?? (question.questionFormat as QuizQuestionFormat);

    const payload = this.prepareQuestionPayload(nextType, {
      questionType: nextType,
      title: dto.title !== undefined ? dto.title : question.title,
      promptText:
        dto.promptText !== undefined ? dto.promptText : question.prompt,
      helperText:
        dto.helperText !== undefined ? dto.helperText : question.subtitle,
      translationText:
        dto.translationText !== undefined
          ? dto.translationText
          : question.promptBn,
      mediaFileId:
        dto.mediaFileId !== undefined
          ? dto.mediaFileId
          : (question.imageFileId ?? question.audioFileId),
      generatedAudioText:
        dto.generatedAudioText !== undefined
          ? dto.generatedAudioText
          : question.generatedAudioText,
      correctBoolean:
        dto.correctBoolean !== undefined
          ? dto.correctBoolean
          : question.correctBoolean,
      points: dto.points !== undefined ? dto.points : question.points,
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
      await manager.getRepository(ExamQuestion).save({
        id: question.id,
        questionFormat: payload.questionType,
        title: payload.title ?? null,
        subtitle: payload.helperText ?? null,
        prompt: payload.promptText ?? null,
        promptBn: payload.translationText ?? null,
        audioFileId: this.resolveAudioFileId(payload),
        imageFileId: this.resolveImageFileId(payload),
        generatedAudioText: payload.generatedAudioText ?? null,
        correctBoolean: payload.correctBoolean ?? null,
        audioSourceType: payload.generatedAudioText
          ? ExamAudioSourceType.AI_VOICE
          : question.audioSourceType,
        points: payload.points ?? question.points,
        sortOrder: payload.sortOrder ?? question.sortOrder,
        status: payload.status ?? question.status,
      });

      await this.replaceQuestionChildren(manager, question.id, payload);
      await this.syncSectionQuestionCount(manager, question.sectionId);
    });

    return this.findQuestionById(question.id);
  }

  async deleteQuestion(questionId: string) {
    const question = await this.examQuestionRepository.findOne({
      where: { id: questionId },
    });

    if (!question) {
      throw new NotFoundException('Exam question not found');
    }

    const sectionId = question.sectionId;

    await this.examQuestionRepository.delete(question.id);
    await this.syncSectionQuestionCountWithoutTransaction(sectionId);

    return {
      message: 'Exam question deleted successfully',
      id: question.id,
    };
  }

  private async ensureDefaultSections(examTemplateId: string) {
    const exam = await this.examTemplateRepository.findOne({
      where: { id: examTemplateId },
    });

    if (!exam) {
      throw new NotFoundException('Final exam not found');
    }

    const existingSections = await this.examSectionRepository.find({
      where: { examTemplateId },
    });

    const existingTypes = new Set(
      existingSections.map((section) => section.sectionType),
    );

    const defaults = [
      {
        sectionType: ExamSectionType.CORE_QUIZ,
        title: 'Part 1: Core Quiz',
        subtitle: 'Standard multiple-choice and fill-in-the-blanks logic.',
        reviewMode: ExamReviewMode.AUTO,
        targetQuestionCount: this.coreQuizTargetQuestions,
        passingPercent: 70,
        sortOrder: 1,
      },
      {
        sectionType: ExamSectionType.LISTENING_LAB,
        title: 'Part 2: Listening Lab',
        subtitle: 'High-fidelity audio comprehension module.',
        reviewMode: ExamReviewMode.AUTO,
        targetQuestionCount: this.listeningTargetQuestions,
        passingPercent: 70,
        sortOrder: 2,
      },
      {
        sectionType: ExamSectionType.WRITING_TASK,
        title: 'Part 3: Writing Task',
        subtitle: 'Extended essay response with accent assistance.',
        reviewMode: ExamReviewMode.MANUAL,
        targetQuestionCount: 1,
        passingPercent: 70,
        sortOrder: 3,
      },
      {
        sectionType: ExamSectionType.SPEAKING_LAB,
        title: 'Part 4: Speaking Lab',
        subtitle: 'Audio recording and fluency check.',
        reviewMode: ExamReviewMode.MANUAL,
        targetQuestionCount: 1,
        passingPercent: 70,
        sortOrder: 4,
      },
    ];

    for (const sectionConfig of defaults) {
      if (existingTypes.has(sectionConfig.sectionType)) {
        continue;
      }

      const section = this.examSectionRepository.create({
        examTemplateId,
        ...sectionConfig,
        questionCount: 0,
        timeLimitSeconds: null,
        status: ExamSectionStatus.DRAFT,
      });

      const savedSection = await this.examSectionRepository.save(section);

      if (sectionConfig.sectionType === ExamSectionType.LISTENING_LAB) {
        await this.upsertSectionRule(savedSection.id, {
          playbackLocked: false,
        });
      }

      if (sectionConfig.sectionType === ExamSectionType.WRITING_TASK) {
        await this.upsertSectionRule(savedSection.id, {
          accentBarEnabled: true,
          minWords: 150,
          maxWords: 200,
        });
      }

      if (sectionConfig.sectionType === ExamSectionType.SPEAKING_LAB) {
        await this.upsertSectionRule(savedSection.id, {
          maxDurationSeconds: 60,
          rerecordPolicy: ExamRetakePolicy.UNLIMITED,
        });
      }
    }
  }

  private async upsertSectionRule(
    sectionId: string,
    dto: {
      playbackLocked?: boolean;
      accentBarEnabled?: boolean;
      minWords?: number | null;
      maxWords?: number | null;
      maxDurationSeconds?: number | null;
      rerecordPolicy?: ExamRetakePolicy;
    },
  ) {
    let rule = await this.examSectionRuleRepository.findOne({
      where: { sectionId },
    });

    if (!rule) {
      rule = this.examSectionRuleRepository.create({
        sectionId,
      });
    }

    if (dto.playbackLocked !== undefined) {
      rule.playbackLocked = dto.playbackLocked;
    }

    if (dto.accentBarEnabled !== undefined) {
      rule.accentBarEnabled = dto.accentBarEnabled;
    }

    if (dto.minWords !== undefined) {
      rule.minWords = dto.minWords;
    }

    if (dto.maxWords !== undefined) {
      rule.maxWords = dto.maxWords;
    }

    if (dto.maxDurationSeconds !== undefined) {
      rule.maxDurationSeconds = dto.maxDurationSeconds;
    }

    if (dto.rerecordPolicy !== undefined) {
      rule.rerecordPolicy = dto.rerecordPolicy;
    }

    return this.examSectionRuleRepository.save(rule);
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
            optionText: 'True',
            isCorrect: payload.correctBoolean === true,
            sortOrder: 1,
          },
          {
            optionText: 'False',
            isCorrect: payload.correctBoolean === false,
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
        this.requireText(payload.promptText, 'Question prompt is required');
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
    options: FinalExamQuestionOptionDto[] | undefined,
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

  private validateSequenceItems(items: FinalExamSequenceItemDto[] | undefined) {
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

  private validatePairs(pairs: FinalExamMatchingPairDto[] | undefined) {
    if (!pairs || pairs.length < 2) {
      throw new BadRequestException('At least two matching pairs are required');
    }
  }

  private validateAcceptedAnswers(
    acceptedAnswers: FinalExamAcceptedAnswerDto[] | undefined,
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

  private resolveAudioFileId(payload: PreparedQuestionPayload) {
    if (
      payload.questionType === QuizQuestionFormat.LISTENING_MCQ ||
      payload.questionType === QuizQuestionFormat.LISTEN_AND_ASSEMBLE
    ) {
      return payload.mediaFileId ?? null;
    }

    return null;
  }

  private resolveImageFileId(payload: PreparedQuestionPayload) {
    if (payload.questionType === QuizQuestionFormat.IDENTIFY_IMAGE) {
      return payload.mediaFileId ?? null;
    }

    return null;
  }

  private async replaceQuestionChildren(
    manager: EntityManager,
    questionId: string,
    payload: PreparedQuestionPayload,
  ) {
    await manager.getRepository(ExamQuestionOption).delete({ questionId });
    await manager.getRepository(ExamMatchingPair).delete({ questionId });
    await manager.getRepository(ExamSequenceItem).delete({ questionId });
    await manager.getRepository(ExamAcceptedAnswer).delete({ questionId });

    if (payload.options?.length) {
      const rows = payload.options.map((option, index) =>
        manager.getRepository(ExamQuestionOption).create({
          questionId,
          optionText: option.optionText.trim(),
          isCorrect: option.isCorrect ?? false,
          sortOrder: option.sortOrder ?? index + 1,
        }),
      );

      await manager.getRepository(ExamQuestionOption).save(rows);
    }

    if (payload.pairs?.length) {
      const rows = payload.pairs.map((pair, index) =>
        manager.getRepository(ExamMatchingPair).create({
          questionId,
          leftText: pair.leftText.trim(),
          rightText: pair.rightText.trim(),
          leftLabel: pair.leftLabel?.trim() || null,
          rightLabel: pair.rightLabel?.trim() || null,
          sortOrder: pair.sortOrder ?? index + 1,
        }),
      );

      await manager.getRepository(ExamMatchingPair).save(rows);
    }

    if (payload.sequenceItems?.length) {
      const rows = payload.sequenceItems.map((item, index) =>
        manager.getRepository(ExamSequenceItem).create({
          questionId,
          itemText: item.wordText.trim(),
          isDecoy: item.isRequired === false,
          correctOrder: item.sortOrder ?? index + 1,
        }),
      );

      await manager.getRepository(ExamSequenceItem).save(rows);
    }

    if (payload.acceptedAnswers?.length) {
      const rows = payload.acceptedAnswers.map((answer, index) =>
        manager.getRepository(ExamAcceptedAnswer).create({
          questionId,
          answerText: answer.answerText.trim(),
          ignoreCase: true,
          ignorePunctuation: true,
          isPrimary: answer.isPrimary ?? index === 0,
          sortOrder: answer.sortOrder ?? index + 1,
        }),
      );

      await manager.getRepository(ExamAcceptedAnswer).save(rows);
    }
  }

  private async syncSectionQuestionCount(
    manager: EntityManager,
    sectionId: string,
  ) {
    const questionCount = await manager.getRepository(ExamQuestion).count({
      where: {
        sectionId,
        status: Not(ExamQuestionStatus.ARCHIVED),
      },
    });

    await manager.getRepository(ExamSection).update(sectionId, {
      questionCount,
    });
  }

  private async syncSectionQuestionCountWithoutTransaction(sectionId: string) {
    const questionCount = await this.countSectionQuestions(sectionId);

    await this.examSectionRepository.update(sectionId, {
      questionCount,
    });
  }

  private async countSectionQuestions(sectionId: string) {
    return this.examQuestionRepository.count({
      where: {
        sectionId,
        status: Not(ExamQuestionStatus.ARCHIVED),
      },
    });
  }

  private async getNonArchivedQuestions(sectionId: string) {
    return this.examQuestionRepository.find({
      where: {
        sectionId,
        status: Not(ExamQuestionStatus.ARCHIVED),
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
  }

  private async activateSectionAndQuestions(
    section: ExamSection,
    questions: ExamQuestion[],
  ) {
    section.status = ExamSectionStatus.ACTIVE;
    section.questionCount = questions.length;

    await this.examSectionRepository.save(section);

    for (const question of questions) {
      question.status = ExamQuestionStatus.ACTIVE;
    }

    await this.examQuestionRepository.save(questions);
  }

  private async getSingleManualQuestion(sectionId: string) {
    return this.examQuestionRepository.findOne({
      where: {
        sectionId,
        status: Not(ExamQuestionStatus.ARCHIVED),
      },
      order: {
        sortOrder: 'ASC',
        createdAt: 'ASC',
      },
    });
  }

  private async getSectionByTypeOrFail(
    examTemplateId: string,
    sectionType: ExamSectionType,
  ) {
    await this.ensureDefaultSections(examTemplateId);

    const section = await this.examSectionRepository.findOne({
      where: {
        examTemplateId,
        sectionType,
      },
      relations: {
        rule: true,
      },
    });

    if (!section) {
      throw new NotFoundException(
        `Final exam section not found: ${sectionType}`,
      );
    }

    return section;
  }

  private async findExamEntityWithSections(examTemplateId: string) {
    await this.ensureDefaultSections(examTemplateId);

    const exam = await this.examTemplateRepository.findOne({
      where: { id: examTemplateId },
      relations: {
        course: true,
        sections: {
          rule: true,
          questions: {
            options: true,
            pairs: true,
            sequenceItems: true,
            acceptedAnswers: true,
          },
        },
      },
    });

    if (!exam) {
      throw new NotFoundException('Final exam not found');
    }

    exam.sections = this.sortSections(exam.sections ?? []);

    return exam;
  }

  private assertExamCanBePublished(exam: ExamTemplate) {
    if (!exam.title?.trim()) {
      throw new BadRequestException('Exam name is required');
    }

    // if (!exam.courseId) {
    //   throw new BadRequestException('Link to course is required');
    // }

    const progress = this.buildSetupProgress(exam);

    if (!progress.checklist.globalRulesConfigured) {
      throw new BadRequestException('Global exam rules are incomplete');
    }

    if (!progress.checklist.coreQuizReady) {
      throw new BadRequestException('Part 1 Core Quiz is not ready');
    }

    if (!progress.checklist.listeningLabReady) {
      throw new BadRequestException('Part 2 Listening Lab is not ready');
    }

    if (!progress.checklist.writingTaskReady) {
      throw new BadRequestException('Part 3 Writing Task is not ready');
    }

    if (!progress.checklist.speakingLabReady) {
      throw new BadRequestException('Part 4 Speaking Lab is not ready');
    }
  }

  private buildSetupProgress(exam: ExamTemplate) {
    const coreQuiz = this.findSection(exam, ExamSectionType.CORE_QUIZ);
    const listeningLab = this.findSection(exam, ExamSectionType.LISTENING_LAB);
    const writingTask = this.findSection(exam, ExamSectionType.WRITING_TASK);
    const speakingLab = this.findSection(exam, ExamSectionType.SPEAKING_LAB);

    const coreQuizCount = this.countSectionQuestionsInMemory(coreQuiz);
    const listeningCount = this.countSectionQuestionsInMemory(listeningLab);
    const writingCount = this.countSectionQuestionsInMemory(writingTask);
    const speakingCount = this.countSectionQuestionsInMemory(speakingLab);

    const checklist = {
      globalRulesConfigured: Boolean(
        exam.unlockCompletionPercent &&
        exam.totalDurationMinutes &&
        exam.overallPassingPercent,
      ),
      coreQuizReady: coreQuizCount === this.coreQuizTargetQuestions,
      listeningLabReady: listeningCount === this.listeningTargetQuestions,
      writingTaskReady: writingCount >= 1 && Boolean(writingTask?.rule),
      speakingLabReady: speakingCount >= 1 && Boolean(speakingLab?.rule),
    };

    const completed = Object.values(checklist).filter(Boolean).length;
    const total = Object.values(checklist).length;

    return {
      percentage: Math.round((completed / total) * 100),
      complete: completed,
      total,
      checklist,
      courseLinked: Boolean(exam.courseId),
      sections: {
        coreQuiz: {
          sectionId: coreQuiz?.id ?? null,
          currentQuestions: coreQuizCount,
          requiredQuestions: this.coreQuizTargetQuestions,
          ready: checklist.coreQuizReady,
        },
        listeningLab: {
          sectionId: listeningLab?.id ?? null,
          currentQuestions: listeningCount,
          requiredQuestions: this.listeningTargetQuestions,
          ready: checklist.listeningLabReady,
        },
        writingTask: {
          sectionId: writingTask?.id ?? null,
          currentQuestions: writingCount,
          requiredQuestions: 1,
          ready: checklist.writingTaskReady,
        },
        speakingLab: {
          sectionId: speakingLab?.id ?? null,
          currentQuestions: speakingCount,
          requiredQuestions: 1,
          ready: checklist.speakingLabReady,
        },
      },
    };
  }

  private countSectionQuestionsInMemory(section?: ExamSection) {
    return (section?.questions ?? []).filter(
      (question) => question.status !== ExamQuestionStatus.ARCHIVED,
    ).length;
  }

  private findSection(exam: ExamTemplate, sectionType: ExamSectionType) {
    return (exam.sections ?? []).find(
      (section) => section.sectionType === sectionType,
    );
  }

  private buildSectionResponse(section: ExamSection) {
    const questions = this.sortQuestions(section.questions ?? []);

    return {
      id: section.id,
      examTemplateId: section.examTemplateId,
      sectionType: section.sectionType,
      title: section.title,
      subtitle: section.subtitle,
      reviewMode: section.reviewMode,
      questionCount: section.questionCount,
      targetQuestionCount: section.targetQuestionCount,
      passingPercent: section.passingPercent,
      timeLimitSeconds: section.timeLimitSeconds,
      sortOrder: section.sortOrder,
      status: section.status,
      rule: section.rule ?? null,
      questions: questions.map((question) =>
        this.buildQuestionResponse(question),
      ),
    };
  }

  private buildQuestionResponse(question: ExamQuestion) {
    const options = [...(question.options ?? [])].sort(
      (first, second) => first.sortOrder - second.sortOrder,
    );

    const pairs = [...(question.pairs ?? [])].sort(
      (first, second) => first.sortOrder - second.sortOrder,
    );

    const sequenceItems = [...(question.sequenceItems ?? [])].sort(
      (first, second) => first.correctOrder - second.correctOrder,
    );

    const acceptedAnswers = [...(question.acceptedAnswers ?? [])].sort(
      (first, second) => first.sortOrder - second.sortOrder,
    );

    return {
      id: question.id,
      sectionId: question.sectionId,
      questionType: question.questionFormat,
      questionFormat: question.questionFormat,
      title: question.title,
      promptText: question.prompt,
      helperText: question.subtitle,
      translationText: question.promptBn,
      mediaFileId: question.imageFileId ?? question.audioFileId,
      audioFileId: question.audioFileId,
      imageFileId: question.imageFileId,
      generatedAudioText: question.generatedAudioText,
      correctBoolean: question.correctBoolean,
      audioSourceType: question.audioSourceType,
      points: question.points,
      sortOrder: question.sortOrder,
      status: question.status,
      options,
      pairs,
      sequenceItems: sequenceItems.map((item) => ({
        id: item.id,
        questionId: item.questionId,
        wordText: item.itemText,
        itemText: item.itemText,
        isRequired: !item.isDecoy,
        isDecoy: item.isDecoy,
        sortOrder: item.correctOrder,
        correctOrder: item.correctOrder,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      acceptedAnswers,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    };
  }

  private sortSections(sections: ExamSection[]) {
    return [...sections].sort((first, second) => {
      if (first.sortOrder !== second.sortOrder) {
        return first.sortOrder - second.sortOrder;
      }

      return first.createdAt.getTime() - second.createdAt.getTime();
    });
  }

  private sortQuestions(questions: ExamQuestion[]) {
    return [...questions].sort((first, second) => {
      if (first.sortOrder !== second.sortOrder) {
        return first.sortOrder - second.sortOrder;
      }

      return first.createdAt.getTime() - second.createdAt.getTime();
    });
  }

  private async getQuestionCountsByExamIds(examIds: string[]) {
    const result = new Map<string, number>();

    if (!examIds.length) {
      return result;
    }

    const rows = await this.examQuestionRepository
      .createQueryBuilder('question')
      .innerJoin('question.section', 'section')
      .select('section.examTemplateId', 'examTemplateId')
      .addSelect('COUNT(question.id)', 'count')
      .where('section.examTemplateId IN (:...examIds)', { examIds })
      .andWhere('question.status != :archivedStatus', {
        archivedStatus: ExamQuestionStatus.ARCHIVED,
      })
      .groupBy('section.examTemplateId')
      .getRawMany<{ examTemplateId: string; count: string }>();

    for (const row of rows) {
      result.set(row.examTemplateId, Number(row.count));
    }

    return result;
  }

  private async getCourseById(courseId: string) {
    const course = await this.courseRepository.findOne({
      where: { id: courseId },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return course;
  }

  private async getExamById(examTemplateId: string) {
    const exam = await this.examTemplateRepository.findOne({
      where: { id: examTemplateId },
    });

    if (!exam) {
      throw new NotFoundException('Final exam not found');
    }

    return exam;
  }

  private mapOptionsToDto(options: ExamQuestionOption[]) {
    return options.map((option) => ({
      optionText: option.optionText,
      isCorrect: option.isCorrect,
      sortOrder: option.sortOrder,
    }));
  }

  private mapPairsToDto(pairs: ExamMatchingPair[]) {
    return pairs.map((pair) => ({
      leftText: pair.leftText,
      rightText: pair.rightText,
      leftLabel: pair.leftLabel ?? undefined,
      rightLabel: pair.rightLabel ?? undefined,
      sortOrder: pair.sortOrder,
    }));
  }

  private mapSequenceItemsToDto(items: ExamSequenceItem[]) {
    return items.map((item) => ({
      wordText: item.itemText,
      isRequired: !item.isDecoy,
      sortOrder: item.correctOrder,
    }));
  }

  private mapAcceptedAnswersToDto(answers: ExamAcceptedAnswer[]) {
    return answers.map((answer) => ({
      answerText: answer.answerText,
      isPrimary: answer.isPrimary,
      sortOrder: answer.sortOrder,
    }));
  }

  async findCoreQuizQuestionById(examTemplateId: string, questionId: string) {
    await this.assertQuestionBelongsToSectionType(
      examTemplateId,
      questionId,
      ExamSectionType.CORE_QUIZ,
    );

    return this.findQuestionById(questionId);
  }

  async updateCoreQuizQuestion(
    examTemplateId: string,
    questionId: string,
    dto: UpdateCoreQuizQuestionDto,
  ) {
    await this.assertQuestionBelongsToSectionType(
      examTemplateId,
      questionId,
      ExamSectionType.CORE_QUIZ,
    );

    return this.updateQuestion(questionId, dto);
  }

  async deleteCoreQuizQuestion(examTemplateId: string, questionId: string) {
    await this.assertQuestionBelongsToSectionType(
      examTemplateId,
      questionId,
      ExamSectionType.CORE_QUIZ,
    );

    return this.deleteQuestion(questionId);
  }

  async findListeningQuestionById(examTemplateId: string, questionId: string) {
    await this.assertQuestionBelongsToSectionType(
      examTemplateId,
      questionId,
      ExamSectionType.LISTENING_LAB,
    );

    return this.findQuestionById(questionId);
  }

  async deleteListeningQuestion(examTemplateId: string, questionId: string) {
    await this.assertQuestionBelongsToSectionType(
      examTemplateId,
      questionId,
      ExamSectionType.LISTENING_LAB,
    );

    return this.deleteQuestion(questionId);
  }

  async getWritingTask(examTemplateId: string) {
    return this.findSingleQuestionBySectionType(
      examTemplateId,
      ExamSectionType.WRITING_TASK,
      FinalExamManualQuestionFormat.WRITING_TASK,
    );
  }

  async deleteWritingTask(examTemplateId: string) {
    const question = await this.findSingleQuestionBySectionType(
      examTemplateId,
      ExamSectionType.WRITING_TASK,
      FinalExamManualQuestionFormat.WRITING_TASK,
    );

    return this.deleteQuestion(question.id);
  }

  async getSpeakingTask(examTemplateId: string) {
    return this.findSingleQuestionBySectionType(
      examTemplateId,
      ExamSectionType.SPEAKING_LAB,
      FinalExamManualQuestionFormat.SPEAKING_TASK,
    );
  }

  async deleteSpeakingTask(examTemplateId: string) {
    const question = await this.findSingleQuestionBySectionType(
      examTemplateId,
      ExamSectionType.SPEAKING_LAB,
      FinalExamManualQuestionFormat.SPEAKING_TASK,
    );

    return this.deleteQuestion(question.id);
  }

  async updateListeningQuestion(
    examTemplateId: string,
    questionId: string,
    dto: UpdateListeningMiniMcqQuestionDto,
  ) {
    const question = await this.assertQuestionBelongsToSectionType(
      examTemplateId,
      questionId,
      ExamSectionType.LISTENING_LAB,
    );

    const payload: PreparedQuestionPayload = {
      questionType: QuizQuestionFormat.LISTENING_MCQ,
      title:
        dto.questionTitle !== undefined ? dto.questionTitle : question.title,
      promptText:
        dto.questionPrompt !== undefined ? dto.questionPrompt : question.prompt,
      helperText:
        question.subtitle ??
        'Listen carefully to the audio and choose the correct answer.',
      mediaFileId:
        dto.audioFileId !== undefined ? dto.audioFileId : question.audioFileId,
      generatedAudioText:
        dto.generatedAudioText !== undefined
          ? dto.generatedAudioText
          : question.generatedAudioText,
      points: dto.points !== undefined ? dto.points : question.points,
      sortOrder: dto.sortOrder ?? question.sortOrder,
      status: question.status,
      options: dto.options ?? this.mapOptionsToDto(question.options ?? []),
    };

    this.validateQuestionPayload(payload);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ExamQuestion).save({
        id: question.id,
        questionFormat: QuizQuestionFormat.LISTENING_MCQ,
        title: payload.title ?? null,
        subtitle:
          payload.helperText ??
          'Listen carefully to the audio and choose the correct answer.',
        prompt: payload.promptText ?? null,
        promptBn: null,
        audioFileId: payload.mediaFileId ?? null,
        imageFileId: null,
        generatedAudioText: payload.generatedAudioText ?? null,
        correctBoolean: null,
        audioSourceType:
          dto.audioSourceType ??
          (payload.generatedAudioText
            ? ExamAudioSourceType.AI_VOICE
            : question.audioSourceType),
        points: payload.points ?? question.points,
        sortOrder: payload.sortOrder ?? question.sortOrder,
        status: question.status,
      });

      await this.replaceQuestionChildren(manager, question.id, payload);
      await this.syncSectionQuestionCount(manager, question.sectionId);
    });

    if (dto.lockPlayback !== undefined) {
      await this.upsertSectionRule(question.sectionId, {
        playbackLocked: dto.lockPlayback,
      });
    }

    return this.findQuestionById(question.id);
  }

  private async assertQuestionBelongsToSectionType(
    examTemplateId: string,
    questionId: string,
    sectionType: ExamSectionType,
  ): Promise<ExamQuestion> {
    const section = await this.examSectionRepository.findOne({
      where: {
        examTemplateId,
        sectionType,
      },
    });

    if (!section) {
      throw new NotFoundException('Exam section not found.');
    }

    const question = await this.examQuestionRepository.findOne({
      where: {
        id: questionId,
        sectionId: section.id,
      },
      relations: {
        options: true,
        pairs: true,
        sequenceItems: true,
        acceptedAnswers: true,
      },
    });

    if (!question) {
      throw new NotFoundException('Question not found in this exam section.');
    }

    return question;
  }

  private async findSingleQuestionBySectionType(
    examTemplateId: string,
    sectionType: ExamSectionType,
    questionFormat: FinalExamManualQuestionFormat,
  ) {
    const section = await this.examSectionRepository.findOne({
      where: {
        examTemplateId,
        sectionType,
      },
    });

    if (!section) {
      throw new NotFoundException('Exam section not found.');
    }

    const question = await this.examQuestionRepository.findOne({
      where: {
        sectionId: section.id,
        questionFormat,
        status: Not(ExamQuestionStatus.ARCHIVED),
      },
      relations: {
        options: true,
        pairs: true,
        sequenceItems: true,
        acceptedAnswers: true,
      },
    });

    if (!question) {
      throw new NotFoundException('Question not found.');
    }

    return this.buildQuestionResponse(question);
  }
}
