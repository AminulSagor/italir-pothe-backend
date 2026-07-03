import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  CvGenerationMode,
  CvGenerationStatus,
} from 'src/cv-generations/enums/cv-generation.enum';
import { CvGenerationsService } from 'src/cv-generations/services/cv-generations.service';
import { CvTemplatesService } from 'src/cv-templates/services/cv-templates.service';
import { FilePurpose } from 'src/files/entities/file.entity';
import {
  FilesService,
  type FileRequestUser,
} from 'src/files/services/files.service';

import { AttachCvAssetsDto } from '../dto/attach-cv-assets.dto';
import { CreateCvSessionDto } from '../dto/create-cv-session.dto';
import { SendCvMessageDto } from '../dto/send-cv-message.dto';
import { CvAssistantMessage } from '../entities/cv-assistant-message.entity';
import { CvAssistantSession } from '../entities/cv-assistant-session.entity';
import {
  CvAssistantConversationMode,
  CvAssistantMessageRole,
  CvAssistantSessionStatus,
} from '../enums/cv-assistant.enum';
import { CvQuestionPlannerService } from './cv-question-planner.service';
import type {
  CvAssistantPlanningContext,
  CvAssistantTurnPlan,
  CvDynamicQuestion,
  CvTemplateAnalysis,
} from './cv-question-planner.service';
import { CvTemplateAnalysisService } from './cv-template-analysis.service';

@Injectable()
export class CvAssistantService {
  constructor(
    @InjectRepository(CvAssistantSession)
    private readonly sessionRepository: Repository<CvAssistantSession>,

    @InjectRepository(CvAssistantMessage)
    private readonly messageRepository: Repository<CvAssistantMessage>,

    private readonly cvTemplatesService: CvTemplatesService,

    private readonly filesService: FilesService,

    private readonly templateAnalysisService: CvTemplateAnalysisService,

    private readonly questionPlannerService: CvQuestionPlannerService,

    private readonly cvGenerationsService: CvGenerationsService,
  ) {}

  async createSession(dto: CreateCvSessionDto, currentUser: FileRequestUser) {
    let templateAnalysis: CvTemplateAnalysis | null = null;

    if (dto.templateId) {
      const template = await this.cvTemplatesService.findById(dto.templateId);

      templateAnalysis = await this.templateAnalysisService.analyze(template);
    }

    if (dto.profilePhotoFileId) {
      await this.assertUserImage(
        dto.profilePhotoFileId,
        currentUser.id,
        FilePurpose.CV_PHOTO,
      );
    }

    const referenceImageFileIds = [
      ...new Set(dto.referenceImageFileIds ?? []),
    ].slice(0, 6);

    await this.assertReferenceImages(referenceImageFileIds, currentUser.id);

    const session = this.sessionRepository.create({
      userId: currentUser.id,

      templateId: dto.templateId ?? null,

      status: CvAssistantSessionStatus.ACTIVE,

      conversationMode:
        dto.conversationMode ?? CvAssistantConversationMode.ONE_BY_ONE,

      currentQuestionKey: null,

      currentQuestion: null,

      collectedCvData: {},

      templateAnalysis: templateAnalysis as unknown as Record<
        string,
        unknown
      > | null,

      skippedQuestionKeys: [],

      progress: 0,

      profilePhotoFileId: dto.profilePhotoFileId ?? null,

      referenceImageFileIds,

      generationId: null,
    });

    const savedSession = await this.sessionRepository.save(session);

    const plan = await this.questionPlannerService.planTurn(
      this.buildPlanningContext(savedSession, {
        event: 'start',
        currentQuestion: null,
        latestUserAnswer: null,
        recentMessages: [],
      }),
    );

    this.applyTurnPlan(savedSession, plan);

    await this.sessionRepository.save(savedSession);

    await this.createMessage({
      sessionId: savedSession.id,

      role: CvAssistantMessageRole.ASSISTANT,

      text: this.buildAssistantReply(plan),

      question: plan.nextQuestion,

      metadata: this.buildPlanMetadata(savedSession, plan),
    });

    return this.getSession(savedSession.id, currentUser.id);
  }

  async getSession(sessionId: string, userId: string) {
    const session = await this.findOwnedSession(sessionId, userId);

    await this.syncGenerationStatus(session);

    const messages = await this.messageRepository.find({
      where: {
        sessionId,
      },
      order: {
        createdAt: 'ASC',
      },
    });

    return this.mapSessionResponse(session, messages);
  }

  async sendMessage(
    sessionId: string,
    dto: SendCvMessageDto,
    currentUser: FileRequestUser,
  ) {
    const session = await this.findOwnedSession(sessionId, currentUser.id);

    await this.syncGenerationStatus(session);

    this.assertSessionCanContinue(session);

    const normalizedMessage = dto.message.trim();

    if (!normalizedMessage) {
      throw new BadRequestException('Message cannot be empty.');
    }

    const currentQuestion = this.getCurrentQuestion(session);

    const requestedMode =
      this.detectRequestedConversationMode(normalizedMessage);

    const previousMode = session.conversationMode;

    if (requestedMode) {
      session.conversationMode = requestedMode;

      await this.sessionRepository.save(session);
    }

    await this.createMessage({
      sessionId: session.id,

      role: CvAssistantMessageRole.USER,

      text: normalizedMessage,

      question: currentQuestion,

      metadata: {
        isModeChangeCommand: requestedMode !== null,

        previousConversationMode: previousMode,

        activeConversationMode: session.conversationMode,
      },
    });

    const recentMessages = await this.getRecentConversation(session.id);

    const event: CvAssistantPlanningContext['event'] = requestedMode
      ? 'mode_change'
      : 'answer';

    const plan = await this.questionPlannerService.planTurn(
      this.buildPlanningContext(session, {
        event,

        currentQuestion,

        latestUserAnswer: requestedMode ? null : normalizedMessage,

        recentMessages,
      }),
    );

    if (!requestedMode) {
      session.collectedCvData =
        this.questionPlannerService.applyExtractedFields(
          session.collectedCvData,
          plan.extractedFields,
        );
    }

    this.applyTurnPlan(session, plan);

    await this.sessionRepository.save(session);

    await this.createMessage({
      sessionId: session.id,

      role: CvAssistantMessageRole.ASSISTANT,

      text: this.buildAssistantReply(plan),

      question: plan.nextQuestion,

      metadata: {
        ...this.buildPlanMetadata(session, plan),

        modeChanged: requestedMode !== null && requestedMode !== previousMode,

        previousConversationMode: previousMode,
      },
    });

    return this.getSession(session.id, currentUser.id);
  }

  async skipCurrentQuestion(sessionId: string, currentUser: FileRequestUser) {
    const session = await this.findOwnedSession(sessionId, currentUser.id);

    await this.syncGenerationStatus(session);

    this.assertSessionCanContinue(session);

    const currentQuestion = this.getCurrentQuestion(session);

    if (!currentQuestion) {
      return this.getSession(session.id, currentUser.id);
    }

    session.skippedQuestionKeys = [
      ...new Set([...session.skippedQuestionKeys, currentQuestion.key]),
    ];

    const recentMessages = await this.getRecentConversation(session.id);

    const plan = await this.questionPlannerService.planTurn(
      this.buildPlanningContext(session, {
        event: 'skip',

        currentQuestion,

        latestUserAnswer: null,

        recentMessages,
      }),
    );

    this.applyTurnPlan(session, plan);

    await this.sessionRepository.save(session);

    await this.createMessage({
      sessionId: session.id,

      role: CvAssistantMessageRole.ASSISTANT,

      text: this.buildAssistantReply(plan),

      question: plan.nextQuestion,

      metadata: {
        ...this.buildPlanMetadata(session, plan),

        skipped: true,

        skippedQuestionKey: currentQuestion.key,
      },
    });

    return this.getSession(session.id, currentUser.id);
  }

  async attachAssets(
    sessionId: string,
    dto: AttachCvAssetsDto,
    currentUser: FileRequestUser,
  ) {
    if (
      !dto.profilePhotoFileId &&
      (!dto.referenceImageFileIds || dto.referenceImageFileIds.length === 0)
    ) {
      throw new BadRequestException(
        'Provide a profile photo or at least one reference image.',
      );
    }

    const session = await this.findOwnedSession(sessionId, currentUser.id);

    await this.syncGenerationStatus(session);

    this.assertSessionCanContinue(session);

    if (dto.profilePhotoFileId) {
      await this.assertUserImage(
        dto.profilePhotoFileId,
        currentUser.id,
        FilePurpose.CV_PHOTO,
      );

      session.profilePhotoFileId = dto.profilePhotoFileId;
    }

    if (dto.referenceImageFileIds?.length) {
      await this.assertReferenceImages(
        dto.referenceImageFileIds,
        currentUser.id,
      );

      session.referenceImageFileIds = [
        ...new Set([
          ...session.referenceImageFileIds,
          ...dto.referenceImageFileIds,
        ]),
      ].slice(0, 6);
    }

    await this.sessionRepository.save(session);

    const recentMessages = await this.getRecentConversation(session.id);

    const plan = await this.questionPlannerService.planTurn(
      this.buildPlanningContext(session, {
        event: 'attachment',

        currentQuestion: this.getCurrentQuestion(session),

        latestUserAnswer: null,

        recentMessages,
      }),
    );

    this.applyTurnPlan(session, plan);

    await this.sessionRepository.save(session);

    await this.createMessage({
      sessionId: session.id,

      role: CvAssistantMessageRole.ASSISTANT,

      text: this.buildAssistantReply(plan),

      question: plan.nextQuestion,

      metadata: {
        ...this.buildPlanMetadata(session, plan),

        attachmentEvent: true,

        profilePhotoFileId: dto.profilePhotoFileId ?? null,

        referenceImageFileIds: dto.referenceImageFileIds ?? [],
      },
    });

    return this.getSession(session.id, currentUser.id);
  }

  async generateCv(sessionId: string, currentUser: FileRequestUser) {
    const session = await this.findOwnedSession(sessionId, currentUser.id);

    await this.syncGenerationStatus(session);

    if (session.status === CvAssistantSessionStatus.CANCELLED) {
      throw new BadRequestException('This CV assistant session is cancelled.');
    }

    if (
      session.generationId &&
      (session.status === CvAssistantSessionStatus.GENERATING ||
        session.status === CvAssistantSessionStatus.COMPLETED)
    ) {
      const existingGeneration = await this.cvGenerationsService.findOne(
        session.generationId,
        currentUser.id,
      );

      return {
        generationId: session.generationId,

        generation: existingGeneration,
      };
    }

    session.status = CvAssistantSessionStatus.GENERATING;

    await this.sessionRepository.save(session);

    try {
      const mode = session.templateId
        ? CvGenerationMode.TEMPLATE
        : CvGenerationMode.SCRATCH;

      const generation =
        await this.cvGenerationsService.createFromAssistantSession(
          {
            assistantSessionId: session.id,

            mode,

            templateId: session.templateId,

            cvData: session.collectedCvData,

            templateAnalysis: session.templateAnalysis,

            style: this.readTextValue(
              session.collectedCvData.designPreferences,
            ),

            colorTheme: this.readTextValue(session.collectedCvData.colorTheme),

            profilePhotoFileId: session.profilePhotoFileId,

            referenceImageFileIds: session.referenceImageFileIds,
          },

          currentUser,
        );

      session.generationId = generation.id;

      session.status = CvAssistantSessionStatus.GENERATING;

      await this.sessionRepository.save(session);

      return {
        generationId: generation.id,

        generation,
      };
    } catch (error) {
      session.status = session.currentQuestion
        ? CvAssistantSessionStatus.ACTIVE
        : CvAssistantSessionStatus.READY_TO_GENERATE;

      await this.sessionRepository.save(session);

      throw error;
    }
  }

  private buildPlanningContext(
    session: CvAssistantSession,
    overrides: {
      event: CvAssistantPlanningContext['event'];

      currentQuestion: CvDynamicQuestion | null;

      latestUserAnswer: string | null;

      recentMessages: Array<{
        role: string;
        text: string;
      }>;
    },
  ): CvAssistantPlanningContext {
    return {
      event: overrides.event,

      conversationMode: session.conversationMode,

      hasTemplate: Boolean(session.templateId),

      templateAnalysis: this.getTemplateAnalysis(session),

      collectedCvData: session.collectedCvData,

      skippedQuestionKeys: session.skippedQuestionKeys,

      currentQuestion: overrides.currentQuestion,

      latestUserAnswer: overrides.latestUserAnswer,

      recentMessages: overrides.recentMessages,

      hasProfilePhoto: Boolean(session.profilePhotoFileId),

      referenceImageCount: session.referenceImageFileIds.length,
    };
  }

  private async syncGenerationStatus(
    session: CvAssistantSession,
  ): Promise<void> {
    if (!session.generationId) {
      return;
    }

    if (
      session.status !== CvAssistantSessionStatus.GENERATING &&
      session.status !== CvAssistantSessionStatus.COMPLETED
    ) {
      return;
    }

    try {
      const generation = await this.cvGenerationsService.findOne(
        session.generationId,
        session.userId,
      );

      if (generation.status === CvGenerationStatus.COMPLETED) {
        if (session.status !== CvAssistantSessionStatus.COMPLETED) {
          session.status = CvAssistantSessionStatus.COMPLETED;

          await this.sessionRepository.save(session);
        }

        return;
      }

      if (generation.status === CvGenerationStatus.FAILED) {
        session.status = session.currentQuestion
          ? CvAssistantSessionStatus.ACTIVE
          : CvAssistantSessionStatus.READY_TO_GENERATE;

        await this.sessionRepository.save(session);
      }
    } catch {
      // Keep the session state when generation lookup
      // is temporarily unavailable.
    }
  }

  private async findOwnedSession(
    sessionId: string,
    userId: string,
  ): Promise<CvAssistantSession> {
    const session = await this.sessionRepository.findOne({
      where: {
        id: sessionId,

        userId,
      },
    });

    if (!session) {
      throw new NotFoundException('CV assistant session not found.');
    }

    return session;
  }

  private assertSessionCanContinue(session: CvAssistantSession): void {
    if (
      session.status === CvAssistantSessionStatus.GENERATING ||
      session.status === CvAssistantSessionStatus.COMPLETED ||
      session.status === CvAssistantSessionStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'This CV assistant session cannot be changed.',
      );
    }
  }

  private async assertReferenceImages(
    fileIds: string[],
    userId: string,
  ): Promise<void> {
    await Promise.all(
      fileIds.map((fileId) =>
        this.assertUserImage(fileId, userId, FilePurpose.CV_REFERENCE_IMAGE),
      ),
    );
  }

  private async assertUserImage(
    fileId: string,
    userId: string,
    expectedPurpose: FilePurpose,
  ): Promise<void> {
    const file = await this.filesService.findActiveFileById(fileId);

    if (file.ownerUserId !== userId) {
      throw new ForbiddenException('You cannot use this file.');
    }

    if (!file.mimeType.startsWith('image/')) {
      throw new BadRequestException('The selected file must be an image.');
    }

    if (file.filePurpose !== expectedPurpose) {
      throw new BadRequestException(
        `The selected image must use the ${expectedPurpose} file purpose.`,
      );
    }
  }

  private async createMessage(params: {
    sessionId: string;

    role: CvAssistantMessageRole;

    text: string;

    question: CvDynamicQuestion | null;

    metadata?: Record<string, unknown>;
  }): Promise<CvAssistantMessage> {
    const message = this.messageRepository.create({
      sessionId: params.sessionId,

      role: params.role,

      text: params.text,

      questionKey: params.question?.key ?? null,

      metadata: {
        ...(params.metadata ?? {}),

        ...(params.question
          ? {
              questionType: params.question.type,

              optional: params.question.optional,
            }
          : {}),
      },
    });

    return this.messageRepository.save(message);
  }

  private getCurrentQuestion(
    session: CvAssistantSession,
  ): CvDynamicQuestion | null {
    if (!session.currentQuestion) {
      return null;
    }

    const question = session.currentQuestion as Partial<CvDynamicQuestion>;

    if (
      typeof question.key !== 'string' ||
      !question.key.trim() ||
      typeof question.text !== 'string' ||
      !question.text.trim() ||
      !question.type
    ) {
      return null;
    }

    return {
      key: question.key.trim(),

      text: question.text.trim(),

      type: question.type,

      optional: question.optional === true,
    };
  }

  private applyTurnPlan(
    session: CvAssistantSession,
    plan: CvAssistantTurnPlan,
  ): void {
    session.currentQuestionKey = plan.nextQuestion?.key ?? null;

    session.currentQuestion = plan.nextQuestion
      ? (plan.nextQuestion as unknown as Record<string, unknown>)
      : null;

    session.progress = Math.max(
      session.progress,
      Math.max(0, Math.min(100, plan.progress)),
    );

    session.status =
      plan.readyToGenerate || !plan.nextQuestion
        ? CvAssistantSessionStatus.READY_TO_GENERATE
        : CvAssistantSessionStatus.ACTIVE;
  }

  private buildAssistantReply(plan: CvAssistantTurnPlan): string {
    const reply = [
      plan.answerFeedback,
      plan.answerJustification,
      plan.nextQuestion?.text,
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join('\n\n');

    if (reply) {
      return reply;
    }

    return plan.readyToGenerate
      ? 'I have enough information to prepare your CV. You can generate it now.'
      : 'Please provide the next detail you want to include in your CV.';
  }

  private buildPlanMetadata(
    session: CvAssistantSession,
    plan: CvAssistantTurnPlan,
  ): Record<string, unknown> {
    return {
      conversationMode: session.conversationMode,

      answerAccepted: plan.answerAccepted,

      answerFeedback: plan.answerFeedback,

      answerJustification: plan.answerJustification,

      extractedFields: plan.extractedFields,

      readyToGenerate: plan.readyToGenerate,

      progress: plan.progress,
    };
  }

  private async getRecentConversation(sessionId: string): Promise<
    Array<{
      role: string;
      text: string;
    }>
  > {
    const messages = await this.messageRepository.find({
      where: {
        sessionId,
      },
      order: {
        createdAt: 'DESC',
      },
      take: 12,
    });

    return messages.reverse().map((message) => ({
      role: message.role,

      text: message.text,
    }));
  }

  private getTemplateAnalysis(
    session: CvAssistantSession,
  ): CvTemplateAnalysis | null {
    return session.templateAnalysis
      ? (session.templateAnalysis as unknown as CvTemplateAnalysis)
      : null;
  }

  private detectRequestedConversationMode(
    message: string,
  ): CvAssistantConversationMode | null {
    const normalized = message
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ');

    const allAtOncePatterns = [
      'all at once',
      'everything at once',
      'all questions together',
      'give me all questions',
      'send me all questions',
      'show me all questions',
      'ask in one message',
      'batch mode',
    ];

    if (
      allAtOncePatterns.some((pattern) => normalized.includes(pattern)) ||
      (normalized.includes('ask') &&
        normalized.includes('all') &&
        normalized.includes('question'))
    ) {
      return CvAssistantConversationMode.ALL_AT_ONCE;
    }

    const oneByOnePatterns = [
      'one by one',
      'one question at a time',
      'step by step',
      'ask separately',
      'single question mode',
    ];

    if (oneByOnePatterns.some((pattern) => normalized.includes(pattern))) {
      return CvAssistantConversationMode.ONE_BY_ONE;
    }

    return null;
  }

  private readTextValue(value: unknown): string | null {
    if (typeof value === 'string') {
      return value.trim() || null;
    }

    if (Array.isArray(value)) {
      const joined = value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .join(', ');

      return joined || null;
    }

    return null;
  }

  private mapSessionResponse(
    session: CvAssistantSession,
    messages: CvAssistantMessage[],
  ) {
    const currentQuestion = this.getCurrentQuestion(session);

    const latestAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === CvAssistantMessageRole.ASSISTANT);

    return {
      id: session.id,

      templateId: session.templateId,

      status: session.status,

      conversationMode: session.conversationMode,

      currentQuestionKey: session.currentQuestionKey,

      currentQuestion: currentQuestion
        ? {
            key: currentQuestion.key,

            text: currentQuestion.text,

            type: currentQuestion.type,

            optional: currentQuestion.optional,
          }
        : null,

      assistantMessage: latestAssistantMessage?.text ?? null,

      collectedCvData: session.collectedCvData,

      skippedQuestionKeys: session.skippedQuestionKeys,

      profilePhotoFileId: session.profilePhotoFileId,

      referenceImageFileIds: session.referenceImageFileIds,

      templateAnalysis: session.templateAnalysis,

      generationId: session.generationId,

      canGenerate: true,

      progress: session.progress,

      messages: messages.map((message) => ({
        id: message.id,

        role: message.role,

        text: message.text,

        questionKey: message.questionKey,

        metadata: message.metadata,

        createdAt: message.createdAt,
      })),

      createdAt: session.createdAt,

      updatedAt: session.updatedAt,
    };
  }
}
