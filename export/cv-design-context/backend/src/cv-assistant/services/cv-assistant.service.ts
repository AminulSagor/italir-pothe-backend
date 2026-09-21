import {
  BadRequestException,
  ConflictException,
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
  CvAssistantEditMode,
  CvAssistantMessageRole,
  CvAssistantPhotoDecision,
  CvAssistantSessionStatus,
} from '../enums/cv-assistant.enum';
import { CvQuestionPlannerService } from './cv-question-planner.service';
import type {
  CvAssistantPlanningContext,
  CvAssistantPlanningState,
  CvAssistantTurnPlan,
  CvDynamicQuestion,
  CvTemplateAnalysis,
} from './cv-question-planner.service';
import { CvTemplateAnalysisService } from './cv-template-analysis.service';
import { StartCvEditDto } from '../dto/start-cv-edit.dto';

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

      pendingSuggestions: [],

      confirmedSuggestionKeys: [],

      rejectedSuggestionKeys: [],

      declinedOptionalSections: [],

      completenessState: {
        missingRequiredFields: [],
        missingTemplateSections: [],
        unresolvedOptionalSections: [],
      },

      photoDecision: dto.profilePhotoFileId
        ? CvAssistantPhotoDecision.UPLOADED
        : templateAnalysis && !templateAnalysis.hasProfilePhotoArea
          ? CvAssistantPhotoDecision.NOT_APPLICABLE
          : CvAssistantPhotoDecision.UNRESOLVED,

      qualityIssues: [],

      qualityCheckPassed: false,

      canGenerate: false,

      qualityCheckedAt: null,

      progress: 0,

      profilePhotoFileId: dto.profilePhotoFileId ?? null,

      referenceImageFileIds,

      generationId: null,

      editMode: null,

      sourceGenerationId: null,

      pendingDesignInstruction: null, //not
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

  async startGenerationEdit(
    generationId: string,

    dto: StartCvEditDto,

    currentUser: FileRequestUser,
  ) {
    const sourceGeneration = await this.cvGenerationsService.findOne(
      generationId,

      currentUser.id,
    );

    if (sourceGeneration.status !== CvGenerationStatus.COMPLETED) {
      throw new BadRequestException('Only a completed CV can be edited.');
    }

    if (
      dto.editMode !== CvAssistantEditMode.FACTS_ONLY &&
      dto.editMode !== CvAssistantEditMode.DESIGN_AND_FACTS
    ) {
      throw new BadRequestException('The selected CV edit mode is invalid.');
    }

    if (sourceGeneration.profilePhotoFileId) {
      await this.assertUserImage(
        sourceGeneration.profilePhotoFileId,

        currentUser.id,

        FilePurpose.CV_PHOTO,
      );
    }

    const referenceImageFileIds = [
      ...new Set(sourceGeneration.referenceImageFileIds ?? []),
    ].slice(0, 6);

    await this.assertReferenceImages(referenceImageFileIds, currentUser.id);

    if (sourceGeneration.templateId) {
      await this.cvTemplatesService.findById(sourceGeneration.templateId);
    }

    const templateAnalysis = this.cloneNullableRecord(
      sourceGeneration.templateAnalysis,
    );

    const collectedCvData = this.cloneRecord(sourceGeneration.cvData);

    /*

     * Keep the previous scratch design settings inside

     * the assistant session so facts-only editing can

     * regenerate with the same design.

     */

    const sourceStyle = this.readTextValue(sourceGeneration.style);

    const sourceColorTheme = this.readTextValue(sourceGeneration.colorTheme);

    if (sourceStyle) {
      collectedCvData.designPreferences = sourceStyle;
    }

    if (sourceColorTheme) {
      collectedCvData.colorTheme = sourceColorTheme;
    }

    const photoDecision = sourceGeneration.profilePhotoFileId
      ? CvAssistantPhotoDecision.UPLOADED
      : templateAnalysis && templateAnalysis.hasProfilePhotoArea === false
        ? CvAssistantPhotoDecision.NOT_APPLICABLE
        : CvAssistantPhotoDecision.WITHOUT_PHOTO;

    const session = this.sessionRepository.create({
      userId: currentUser.id,

      templateId: sourceGeneration.templateId ?? null,

      status: CvAssistantSessionStatus.ACTIVE,

      conversationMode: CvAssistantConversationMode.ONE_BY_ONE,

      currentQuestionKey: null,

      currentQuestion: null,

      collectedCvData,

      templateAnalysis,

      skippedQuestionKeys: [],

      pendingSuggestions: [],

      confirmedSuggestionKeys: [],

      rejectedSuggestionKeys: [],

      declinedOptionalSections: [],

      completenessState: {
        missingRequiredFields: [],

        missingTemplateSections: [],

        unresolvedOptionalSections: [],
      },

      photoDecision,

      qualityIssues: [],

      qualityCheckPassed: false,

      canGenerate: false,

      qualityCheckedAt: null,

      progress: 0,

      profilePhotoFileId: sourceGeneration.profilePhotoFileId ?? null,

      referenceImageFileIds,

      /*

       * This session will create a new generation.

       * The original one remains unchanged.

       */

      generationId: null,

      editMode: dto.editMode,

      sourceGenerationId: sourceGeneration.id,

      pendingDesignInstruction:
        dto.editMode === CvAssistantEditMode.FACTS_ONLY
          ? this.readTextValue(sourceGeneration.regenerationInstruction)
          : null,
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

      metadata: {
        ...this.buildPlanMetadata(savedSession, plan),

        editSessionStarted: true,

        editMode: savedSession.editMode,

        sourceGenerationId: savedSession.sourceGenerationId,
      },
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

        editMode: session.editMode,
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

      this.syncEditStateFromCollectedData(session);
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

      session.photoDecision = CvAssistantPhotoDecision.UPLOADED;
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

    /*
     * Return the already-created generation when the user
     * repeats the request after generation has started.
     */
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

    if (session.editMode && !session.sourceGenerationId) {
      throw new BadRequestException(
        'The source CV generation is missing from this edit session.',
      );
    }

    if (
      session.editMode === CvAssistantEditMode.DESIGN_AND_FACTS &&
      !session.pendingDesignInstruction?.trim()
    ) {
      throw new BadRequestException(
        'Please complete the design instruction before generating the updated CV.',
      );
    }

    const currentQuestion = this.getCurrentQuestion(session);

    const planningState = this.evaluateSessionPlanningState(session);

    const canGenerate =
      planningState.canGenerate === true &&
      session.canGenerate === true &&
      session.qualityCheckPassed === true &&
      currentQuestion === null &&
      session.status === CvAssistantSessionStatus.READY_TO_GENERATE;

    if (!canGenerate) {
      throw new BadRequestException(
        this.buildGenerationValidationMessage(planningState, session),
      );
    }

    /*
     * Atomically claim this assistant session.
     *
     * Only one simultaneous request can change the session
     * from READY_TO_GENERATE to GENERATING.
     */
    const claimResult = await this.sessionRepository.update(
      {
        id: session.id,
        userId: currentUser.id,
        status: CvAssistantSessionStatus.READY_TO_GENERATE,
      },
      {
        status: CvAssistantSessionStatus.GENERATING,
        progress: 100,
      },
    );

    if (claimResult.affected !== 1) {
      const latestSession = await this.findOwnedSession(
        session.id,
        currentUser.id,
      );

      await this.syncGenerationStatus(latestSession);

      /*
       * Another request may already have created and linked
       * the generation. Return that same generation instead
       * of generating another one.
       */
      if (
        latestSession.generationId &&
        (latestSession.status === CvAssistantSessionStatus.GENERATING ||
          latestSession.status === CvAssistantSessionStatus.COMPLETED)
      ) {
        const existingGeneration = await this.cvGenerationsService.findOne(
          latestSession.generationId,
          currentUser.id,
        );

        return {
          generationId: latestSession.generationId,
          generation: existingGeneration,
        };
      }

      if (latestSession.status === CvAssistantSessionStatus.GENERATING) {
        throw new ConflictException(
          'CV generation has already started. Please check the session again shortly.',
        );
      }

      const latestPlanningState =
        this.evaluateSessionPlanningState(latestSession);

      throw new BadRequestException(
        this.buildGenerationValidationMessage(
          latestPlanningState,
          latestSession,
        ),
      );
    }

    /*
     * Keep the in-memory entity synchronized with the atomic
     * database update.
     */
    session.status = CvAssistantSessionStatus.GENERATING;

    session.progress = 100;

    let createdGenerationId: string | null = null;

    try {
      const mode = session.templateId
        ? CvGenerationMode.TEMPLATE
        : CvGenerationMode.SCRATCH;

      const generationCvData = this.buildGenerationCvData(
        session.collectedCvData,
      );

      const generation =
        await this.cvGenerationsService.createFromAssistantSession(
          {
            assistantSessionId: session.id,

            sourceGenerationId: session.sourceGenerationId,

            mode,

            templateId: session.templateId,

            cvData: generationCvData,

            templateAnalysis: session.templateAnalysis,

            style: this.readTextValue(
              session.collectedCvData.designPreferences,
            ),

            colorTheme: this.readTextValue(session.collectedCvData.colorTheme),

            regenerationInstruction: session.editMode
              ? session.pendingDesignInstruction
              : null,

            profilePhotoFileId: session.profilePhotoFileId,

            referenceImageFileIds: session.referenceImageFileIds,
          },

          currentUser,
        );

      createdGenerationId = generation.id;

      session.generationId = generation.id;

      session.status = CvAssistantSessionStatus.GENERATING;

      session.progress = 100;

      await this.sessionRepository.save(session);

      return {
        generationId: generation.id,
        generation,
      };
    } catch (error) {
      if (createdGenerationId) {
        /*
         * The generation row already exists. Do not restore the
         * session to READY_TO_GENERATE because that could allow
         * another request to create and charge for a second CV.
         *
         * Retry linking the existing generation to the session.
         */
        try {
          await this.sessionRepository.update(
            {
              id: session.id,
              userId: currentUser.id,
            },
            {
              generationId: createdGenerationId,
              status: CvAssistantSessionStatus.GENERATING,
              progress: 100,
            },
          );
        } catch {
          /*
           * Keep the original generation error. The database
           * unique protection added later provides the final
           * duplicate-generation safeguard.
           */
        }
      } else {
        /*
         * No generation was created, so the user can safely
         * retry after the session readiness is restored.
         */
        try {
          await this.restoreSessionReadiness(session);
        } catch {
          /*
           * Preserve the original generation error.
           */
        }
      }

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

      currentQuestion: overrides.currentQuestion,

      latestUserAnswer: overrides.latestUserAnswer,

      recentMessages: overrides.recentMessages,

      hasProfilePhoto: Boolean(session.profilePhotoFileId),

      referenceImageCount: session.referenceImageFileIds.length,

      editMode: session.editMode,

      sourceGenerationId: session.sourceGenerationId,

      pendingDesignInstruction: session.pendingDesignInstruction,
    };
  }

  private evaluateSessionPlanningState(
    session: CvAssistantSession,
  ): CvAssistantPlanningState {
    return this.questionPlannerService.evaluatePlanningState(
      this.buildPlanningContext(session, {
        event: 'answer',

        currentQuestion: this.getCurrentQuestion(session),

        latestUserAnswer: null,

        recentMessages: [],
      }),
    );
  }

  private async restoreSessionReadiness(
    session: CvAssistantSession,
  ): Promise<void> {
    const planningState = this.evaluateSessionPlanningState(session);

    const currentQuestion = this.getCurrentQuestion(session);

    const isReady =
      planningState.canGenerate === true &&
      session.canGenerate === true &&
      session.qualityCheckPassed === true &&
      currentQuestion === null &&
      (session.editMode !== CvAssistantEditMode.DESIGN_AND_FACTS ||
        Boolean(session.pendingDesignInstruction?.trim()));

    session.status = isReady
      ? CvAssistantSessionStatus.READY_TO_GENERATE
      : CvAssistantSessionStatus.ACTIVE;

    session.progress = isReady ? 100 : Math.min(session.progress, 99);

    await this.sessionRepository.save(session);
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
        await this.restoreSessionReadiness(session);
      }
    } catch {
      // Preserve the current state if the generation
      // lookup is temporarily unavailable.
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

    const planningState = plan.planningState;

    if (planningState) {
      session.pendingSuggestions = planningState.pendingSuggestions;

      session.confirmedSuggestionKeys = planningState.confirmedSuggestions;

      session.rejectedSuggestionKeys = planningState.rejectedSuggestions;

      session.declinedOptionalSections = planningState.declinedOptionalSections;

      session.completenessState = {
        missingRequiredFields: planningState.missingRequiredFields,

        missingTemplateSections: planningState.missingTemplateSections,

        unresolvedOptionalSections: planningState.unresolvedOptionalSections,
      };

      session.photoDecision =
        planningState.photoDecision as CvAssistantPhotoDecision;

      session.qualityIssues = planningState.qualityIssues;

      session.qualityCheckPassed = planningState.qualityIssues.length === 0;

      session.canGenerate = planningState.canGenerate;

      session.qualityCheckedAt = new Date();
    } else {
      /*
       * Fail closed if no authoritative validation
       * state was returned.
       */
      session.canGenerate = false;

      session.qualityCheckPassed = false;

      session.qualityCheckedAt = new Date();
    }

    const designInstructionReady =
      session.editMode !== CvAssistantEditMode.DESIGN_AND_FACTS ||
      Boolean(session.pendingDesignInstruction?.trim());

    const isReady =
      plan.readyToGenerate === true &&
      session.canGenerate === true &&
      session.qualityCheckPassed === true &&
      designInstructionReady &&
      plan.nextQuestion === null;

    session.progress = isReady ? 100 : Math.max(0, Math.min(99, plan.progress));

    session.status = isReady
      ? CvAssistantSessionStatus.READY_TO_GENERATE
      : CvAssistantSessionStatus.ACTIVE;
  }

  private buildAssistantReply(plan: CvAssistantTurnPlan): string {
    const reply = [plan.answerFeedback, plan.nextQuestion?.text]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join('\n\n');

    if (reply) {
      return reply;
    }

    return plan.readyToGenerate && plan.planningState?.canGenerate === true
      ? 'Your CV information has passed the final quality check. You can generate it now.'
      : 'Please provide the next required detail for your CV.';
  }

  private buildPlanMetadata(
    session: CvAssistantSession,
    plan: CvAssistantTurnPlan,
  ): Record<string, unknown> {
    return {
      conversationMode: session.conversationMode,

      editMode: session.editMode,

      sourceGenerationId: session.sourceGenerationId,

      pendingDesignInstruction: session.pendingDesignInstruction,

      answerAccepted: plan.answerAccepted,

      answerFeedback: plan.answerFeedback,

      answerJustification: plan.answerJustification,

      extractedFields: plan.extractedFields,

      readyToGenerate: plan.readyToGenerate,

      progress: plan.progress,

      planningState: plan.planningState ?? null,
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

  private syncEditStateFromCollectedData(session: CvAssistantSession): void {
    const designInstruction = this.readTextValue(
      session.collectedCvData.pendingDesignInstruction,
    );

    if (designInstruction) {
      session.pendingDesignInstruction = designInstruction;
    }

    /*
     * pendingDesignInstruction is assistant workflow
     * state, not candidate CV content.
     */
    if (
      Object.prototype.hasOwnProperty.call(
        session.collectedCvData,
        'pendingDesignInstruction',
      )
    ) {
      const { pendingDesignInstruction: _ignored, ...remainingData } =
        session.collectedCvData;

      session.collectedCvData = remainingData;
    }
  }

  private buildGenerationCvData(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    const data = this.cloneRecord(value);

    const workflowKeys = [
      'assistantDeclinedSections',
      'assistantResolvedSuggestions',
      'assistantRejectedSuggestions',
      'assistantConfirmedAbbreviations',
      'photoPreference',
      'editFactsStatus',
      'pendingDesignInstruction',
    ];

    for (const key of workflowKeys) {
      delete data[key];
    }

    /*
     * These values are sent separately to the
     * generation service.
     */
    delete data.designPreferences;
    delete data.colorTheme;

    return data;
  }

  private cloneRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }

  private cloneNullableRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return this.cloneRecord(value);
  }

  private mapSessionResponse(
    session: CvAssistantSession,
    messages: CvAssistantMessage[],
  ) {
    const currentQuestion = this.getCurrentQuestion(session);

    const planningState: CvAssistantPlanningState = {
      pendingSuggestions: session.pendingSuggestions ?? [],

      confirmedSuggestions: session.confirmedSuggestionKeys ?? [],

      rejectedSuggestions: session.rejectedSuggestionKeys ?? [],

      declinedOptionalSections: session.declinedOptionalSections ?? [],

      missingRequiredFields:
        session.completenessState?.missingRequiredFields ?? [],

      missingTemplateSections:
        session.completenessState?.missingTemplateSections ?? [],

      unresolvedOptionalSections:
        session.completenessState?.unresolvedOptionalSections ?? [],

      photoDecision: session.photoDecision,

      qualityIssues: session.qualityIssues ?? [],

      canGenerate: session.canGenerate === true,
    };

    const designInstructionReady =
      session.editMode !== CvAssistantEditMode.DESIGN_AND_FACTS ||
      Boolean(session.pendingDesignInstruction?.trim());

    const validationComplete =
      session.canGenerate === true &&
      session.qualityCheckPassed === true &&
      currentQuestion === null &&
      designInstructionReady &&
      planningState.pendingSuggestions.length === 0 &&
      planningState.missingRequiredFields.length === 0 &&
      planningState.missingTemplateSections.length === 0 &&
      planningState.unresolvedOptionalSections.length === 0 &&
      planningState.qualityIssues.length === 0 &&
      planningState.photoDecision !== 'unresolved';

    const canGenerate =
      validationComplete &&
      session.status === CvAssistantSessionStatus.READY_TO_GENERATE;

    const latestAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === CvAssistantMessageRole.ASSISTANT);

    return {
      id: session.id,

      templateId: session.templateId,

      status: session.status,

      conversationMode: session.conversationMode,

      editMode: session.editMode,

      sourceGenerationId: session.sourceGenerationId,

      pendingDesignInstruction: session.pendingDesignInstruction,

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

      canGenerate,

      planningState,

      generationBlockers: this.getGenerationBlockers(planningState, session),

      qualityCheckPassed: session.qualityCheckPassed === true,

      qualityCheckedAt: session.qualityCheckedAt,

      validationComplete,

      progress: validationComplete
        ? 100
        : Math.max(0, Math.min(99, session.progress)),

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

  private getGenerationBlockers(
    planningState: CvAssistantPlanningState,
    session?: CvAssistantSession,
  ): string[] {
    const blockers: string[] = [];

    for (const field of planningState.missingRequiredFields) {
      blockers.push(`Missing required information: ${field}.`);
    }

    for (const section of planningState.missingTemplateSections) {
      blockers.push(`Template section "${section}" is incomplete.`);
    }

    for (const section of planningState.unresolvedOptionalSections) {
      blockers.push(
        `Optional section "${section}" must be answered or declined.`,
      );
    }

    for (const suggestion of planningState.pendingSuggestions) {
      blockers.push(
        `Suggestion "${suggestion.key}" must be accepted, edited, or rejected.`,
      );
    }

    if (planningState.photoDecision === 'unresolved') {
      blockers.push(
        'Choose whether to upload a profile photo or continue without one.',
      );
    }

    if (session?.editMode && !session.sourceGenerationId) {
      blockers.push('The source CV generation is missing.');
    }

    if (
      session?.editMode === CvAssistantEditMode.DESIGN_AND_FACTS &&
      !session.pendingDesignInstruction?.trim()
    ) {
      blockers.push('The design instruction is still required.');
    }

    blockers.push(...planningState.qualityIssues);

    return [...new Set(blockers.map((item) => item.trim()).filter(Boolean))];
  }

  private buildGenerationValidationMessage(
    planningState: CvAssistantPlanningState,
    session: CvAssistantSession,
  ): string {
    const blockers = this.getGenerationBlockers(planningState, session);

    if (blockers.length === 0) {
      return (
        'We cannot generate your CV yet. ' +
        'Please complete all required information and resolve every pending suggestion.'
      );
    }

    return ['We cannot generate your CV yet.', ...blockers].join(' ');
  }
}
