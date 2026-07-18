import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, DeepPartial, Repository } from 'typeorm';

import { CvTemplatesService } from 'src/cv-templates/services/cv-templates.service';
import { FilePurpose } from 'src/files/entities/file.entity';
import {
  FilesService,
  type FileRequestUser,
} from 'src/files/services/files.service';
import { StoreWalletService } from 'src/package-store/services/store-wallet.service';
import { CvGenerationChargeSource } from 'src/package-store/types/package-store.type';

import { CreateCvGenerationDto } from '../dto/create-cv-generation.dto';
import { CvDataDto } from '../dto/cv-data.dto';
import { RegenerateCvGenerationDto } from '../dto/regenerate-cv-generation.dto';
import { CvGeneration } from '../entities/cv-generation.entity';
import {
  CvGenerationMode,
  CvGenerationStatus,
} from '../enums/cv-generation.enum';
import {
  CvImageGenerationService,
  type CvReferenceImage,
} from './cv-image-generation.service';
import { CvPromptService } from './cv-prompt.service';

export interface CreateCvGenerationFromAssistantParams {
  assistantSessionId: string;

  sourceGenerationId?: string | null;

  mode: CvGenerationMode;

  templateId: string | null;

  cvData: Record<string, unknown>;

  templateAnalysis: Record<string, unknown> | null;

  style?: string | null;

  colorTheme?: string | null;

  regenerationInstruction?: string | null;

  profilePhotoFileId: string | null;

  referenceImageFileIds: string[];
}

@Injectable()
export class CvGenerationsService {
  private readonly logger = new Logger(CvGenerationsService.name);

  constructor(
    @InjectRepository(CvGeneration)
    private readonly cvGenerationRepository: Repository<CvGeneration>,

    private readonly dataSource: DataSource,

    private readonly storeWalletService: StoreWalletService,

    private readonly cvTemplatesService: CvTemplatesService,

    private readonly filesService: FilesService,

    private readonly cvPromptService: CvPromptService,

    private readonly cvImageGenerationService: CvImageGenerationService,
  ) {}

  /**
   * Existing form-based CV generation.
   */
  async create(dto: CreateCvGenerationDto, currentUser: FileRequestUser) {
    this.validateMode(dto);

    if (dto.profilePhotoFileId) {
      await this.assertOwnedProfilePhoto(
        dto.profilePhotoFileId,
        currentUser.id,
      );
    }

    if (dto.mode === CvGenerationMode.TEMPLATE && dto.templateId) {
      await this.cvTemplatesService.findById(dto.templateId);
    }

    const savedGeneration = await this.createProcessingGeneration(currentUser, {
      assistantSessionId: null,

      sourceGenerationId: null,

      mode: dto.mode,

      templateId: dto.templateId ?? null,

      cvData: this.cloneRecord(dto.cvData),

      templateAnalysis: null,

      style:
        dto.mode === CvGenerationMode.SCRATCH
          ? this.truncateNullable(
              dto.style?.trim() || 'modern professional',
              100,
            )
          : null,

      colorTheme:
        dto.mode === CvGenerationMode.SCRATCH
          ? this.truncateNullable(
              dto.colorTheme?.trim() || 'clean neutral',
              100,
            )
          : null,

      regenerationInstruction: null,

      profilePhotoFileId: dto.profilePhotoFileId ?? null,

      referenceImageFileIds: [],

      generatedImageFileId: null,

      errorMessage: null,
    });

    void this.processGeneration(savedGeneration.id, currentUser);

    return this.mapGenerationResponse(savedGeneration);
  }

  /**
   * Creates a generation using information collected by
   * the CV assistant chatbot.
   */
  async createFromAssistantSession(
    params: CreateCvGenerationFromAssistantParams,
    currentUser: FileRequestUser,
  ) {
    this.validateAssistantGeneration(params);

    if (params.profilePhotoFileId) {
      await this.assertOwnedProfilePhoto(
        params.profilePhotoFileId,
        currentUser.id,
      );
    }

    const referenceImageFileIds = [
      ...new Set(params.referenceImageFileIds ?? []),
    ].slice(0, 6);

    await this.assertOwnedReferenceImages(
      referenceImageFileIds,
      currentUser.id,
    );

    if (params.mode === CvGenerationMode.TEMPLATE && params.templateId) {
      await this.cvTemplatesService.findById(params.templateId);
    }

    /*
     * New assistant CV:
     * sourceGenerationId is null
     * → consumes free allowance first
     * → then one purchased credit
     *
     * Assistant edit:
     * sourceGenerationId is present
     * → free when allowEditingWithoutCredit is true
     * → otherwise consumes normal access
     */
    const savedGeneration = await this.createProcessingGeneration(currentUser, {
      assistantSessionId: params.assistantSessionId,

      sourceGenerationId: params.sourceGenerationId ?? null,

      mode: params.mode,

      templateId: params.templateId,

      /*
       * Preserve a separate copy so later assistant
       * changes cannot mutate this generation.
       */
      cvData: this.cloneRecord(params.cvData),

      templateAnalysis: this.cloneNullableRecord(params.templateAnalysis),

      style:
        params.mode === CvGenerationMode.SCRATCH
          ? this.truncateNullable(
              params.style?.trim() || 'modern professional',
              100,
            )
          : null,

      colorTheme:
        params.mode === CvGenerationMode.SCRATCH
          ? this.truncateNullable(
              params.colorTheme?.trim() || 'clean neutral',
              100,
            )
          : null,

      regenerationInstruction: params.regenerationInstruction?.trim() || null,

      profilePhotoFileId: params.profilePhotoFileId,

      referenceImageFileIds,

      generatedImageFileId: null,

      errorMessage: null,
    });

    void this.processGeneration(savedGeneration.id, currentUser);

    return this.mapGenerationResponse(savedGeneration);
  }

  async findAll(userId: string, page = 1, limit = 10) {
    const normalizedPage = Math.max(1, page);

    const normalizedLimit = Math.min(50, Math.max(1, limit));

    const [generations, totalItems] =
      await this.cvGenerationRepository.findAndCount({
        where: {
          userId,
        },

        order: {
          createdAt: 'DESC',
        },

        skip: (normalizedPage - 1) * normalizedLimit,

        take: normalizedLimit,
      });

    const mappedGenerations = await Promise.all(
      generations.map((generation) => this.mapGenerationResponse(generation)),
    );

    return {
      generations: mappedGenerations,

      pagination: {
        page: normalizedPage,

        limit: normalizedLimit,

        totalItems,

        totalPages:
          totalItems === 0 ? 0 : Math.ceil(totalItems / normalizedLimit),
      },
    };
  }

  async findOne(generationId: string, userId: string) {
    const generation = await this.findOwnedGeneration(generationId, userId);

    return this.mapGenerationResponse(generation);
  }

  async regenerate(
    generationId: string,
    dto: RegenerateCvGenerationDto,
    currentUser: FileRequestUser,
  ) {
    const originalGeneration = await this.findOwnedGeneration(
      generationId,
      currentUser.id,
    );

    if (originalGeneration.status !== CvGenerationStatus.COMPLETED) {
      throw new BadRequestException('Only a completed CV can be regenerated.');
    }

    const designInstruction = dto.designInstruction.trim();

    if (!designInstruction) {
      throw new BadRequestException('A design instruction is required.');
    }

    if (originalGeneration.profilePhotoFileId) {
      await this.assertOwnedProfilePhoto(
        originalGeneration.profilePhotoFileId,
        currentUser.id,
      );
    }

    const referenceImageFileIds = [
      ...new Set(originalGeneration.referenceImageFileIds ?? []),
    ].slice(0, 6);

    await this.assertOwnedReferenceImages(
      referenceImageFileIds,
      currentUser.id,
    );

    if (
      originalGeneration.mode === CvGenerationMode.TEMPLATE &&
      originalGeneration.templateId
    ) {
      await this.cvTemplatesService.findById(originalGeneration.templateId);
    }

    /*
     * sourceGenerationId marks this as an edit/regeneration.
     *
     * When allowEditingWithoutCredit is true:
     * no free allowance or paid credit is consumed.
     *
     * When allowEditingWithoutCredit is false:
     * free allowance is consumed first, then one purchased credit.
     */
    const savedGeneration = await this.createProcessingGeneration(currentUser, {
      assistantSessionId: null,

      sourceGenerationId: originalGeneration.id,

      mode: originalGeneration.mode,

      templateId: originalGeneration.templateId,

      /*
       * Preserve the exact confirmed CV facts.
       * No factual edit is allowed here.
       */
      cvData: this.cloneRecord(originalGeneration.cvData),

      /*
       * Preserve the exact template analysis.
       */
      templateAnalysis: this.cloneNullableRecord(
        originalGeneration.templateAnalysis,
      ),

      /*
       * Preserve the original design settings.
       */
      style: originalGeneration.style,

      colorTheme: originalGeneration.colorTheme,

      /*
       * Apply only the new design instruction.
       */
      regenerationInstruction: designInstruction,

      /*
       * Preserve the exact photo and references.
       */
      profilePhotoFileId: originalGeneration.profilePhotoFileId,

      referenceImageFileIds,

      generatedImageFileId: null,

      errorMessage: null,
    });

    void this.processGeneration(savedGeneration.id, currentUser);

    return this.mapGenerationResponse(savedGeneration);
  }

  async delete(generationId: string, currentUser: FileRequestUser) {
    const generation = await this.findOwnedGeneration(
      generationId,
      currentUser.id,
    );

    if (generation.generatedImageFileId) {
      try {
        await this.filesService.archiveFile(
          generation.generatedImageFileId,
          currentUser,
        );
      } catch {
        this.logger.warn(
          `Generated CV file could not be archived for generation ${generation.id}.`,
        );
      }
    }

    await this.cvGenerationRepository.remove(generation);

    return {
      message: 'CV generation deleted successfully.',

      generationId,
    };
  }

  private async processGeneration(
    generationId: string,
    currentUser: FileRequestUser,
  ): Promise<void> {
    const generation = await this.cvGenerationRepository.findOne({
      where: {
        id: generationId,
      },
    });

    if (!generation) {
      return;
    }

    try {
      const cvData = Object.assign(
        new CvDataDto(),
        this.cloneRecord(generation.cvData),
      );

      const profilePhotoUrl = generation.profilePhotoFileId
        ? await this.getOwnedProfilePhotoSignedUrl(
            generation.profilePhotoFileId,
            generation.userId,
          )
        : null;

      const designReferences = await this.getOwnedReferenceImageSignedUrls(
        generation.referenceImageFileIds ?? [],
        generation.userId,
      );

      let generatedImageBuffer: Buffer;

      if (generation.mode === CvGenerationMode.TEMPLATE) {
        /*
         * Template mode already uses the selected
         * template image as its primary reference.
         */
        generatedImageBuffer = await this.processTemplateGeneration({
          generation,

          cvData,

          profilePhotoUrl,

          designReferences,
        });
      } else {
        /*
         * For edited or regenerated scratch CVs,
         * load the previous generated CV image so
         * its design can be preserved.
         */
        const sourceDesignReference =
          await this.getSourceGenerationDesignReference(generation);

        generatedImageBuffer = await this.processScratchGeneration({
          generation,

          cvData,

          profilePhotoUrl,

          designReferences,

          sourceDesignReference,
        });
      }

      const uploadedFile = await this.filesService.createFileFromBuffer(
        generatedImageBuffer,

        `generated-cv-${generation.id}.jpg`,

        'image/jpeg',

        currentUser,

        FilePurpose.CV_GENERATED_IMAGE,
      );

      generation.generatedImageFileId = uploadedFile.file.id;

      generation.status = CvGenerationStatus.COMPLETED;

      generation.errorMessage = null;

      await this.cvGenerationRepository.save(generation);
    } catch (error) {
      const safeError = this.getSafeGenerationError(error);

      /*
       * Mark the generation as failed and refund the
       * exact free allowance or paid credit only once.
       */
      await this.failGenerationAndRefund(generation.id, safeError);

      const logMessage =
        error instanceof Error ? error.message : 'Unknown generation error';

      this.logger.error(`CV generation ${generation.id} failed: ${logMessage}`);
    }
  }

  private async processTemplateGeneration(params: {
    generation: CvGeneration;

    cvData: CvDataDto;

    profilePhotoUrl: string | null;

    designReferences: CvReferenceImage[];
  }): Promise<Buffer> {
    const { generation, cvData, profilePhotoUrl, designReferences } = params;

    if (!generation.templateId) {
      throw new BadRequestException(
        'A template ID is required for template generation.',
      );
    }

    const template = await this.cvTemplatesService.findById(
      generation.templateId,
    );

    /*
     * Reference positions for template mode:
     *
     * Reference 1 = selected CV template
     * Reference 2 = candidate photo, when provided
     * Remaining references = additional design references
     */
    const templateReferenceIndex = 1;

    const profilePhotoReferenceIndex = profilePhotoUrl ? 2 : null;

    const references: CvReferenceImage[] = [
      {
        url: template.imageUrl,

        fileName: 'cv-template-reference',
      },
    ];

    if (profilePhotoUrl) {
      references.push({
        url: profilePhotoUrl,

        fileName: 'candidate-profile-photo',
      });
    }

    references.push(...designReferences);

    const designReferenceStartIndex =
      1 + 1 + (profilePhotoReferenceIndex !== null ? 1 : 0);

    const basePrompt = this.cvPromptService.buildTemplatePrompt({
      cvData,

      hasProfilePhoto: profilePhotoReferenceIndex !== null,

      templateReferenceIndex,

      profilePhotoReferenceIndex,

      regenerationInstruction: generation.regenerationInstruction,
    });

    const prompt = this.extendGenerationPrompt({
      basePrompt,

      generation,

      designReferenceCount: designReferences.length,

      designReferenceStartIndex,

      templateIsPrimary: true,
    });

    return this.cvImageGenerationService.generateFromReferences(
      prompt,
      references,
    );
  }

  private async processScratchGeneration(params: {
    generation: CvGeneration;

    cvData: CvDataDto;

    profilePhotoUrl: string | null;

    designReferences: CvReferenceImage[];

    sourceDesignReference: CvReferenceImage | null;
  }): Promise<Buffer> {
    const {
      generation,
      cvData,
      profilePhotoUrl,
      designReferences,
      sourceDesignReference,
    } = params;

    /*
     * Reference positions for scratch mode:
     *
     * Normal scratch CV:
     * Reference 1 = candidate photo
     *
     * Edited or regenerated scratch CV:
     * Reference 1 = previously generated CV
     * Reference 2 = candidate photo
     *
     * Additional design references always come last.
     */
    const sourceDesignReferenceIndex = sourceDesignReference ? 1 : null;

    const profilePhotoReferenceIndex = profilePhotoUrl
      ? sourceDesignReferenceIndex !== null
        ? sourceDesignReferenceIndex + 1
        : 1
      : null;

    const designReferenceStartIndex =
      1 +
      (sourceDesignReferenceIndex !== null ? 1 : 0) +
      (profilePhotoReferenceIndex !== null ? 1 : 0);

    const basePrompt = this.cvPromptService.buildScratchPrompt({
      cvData,

      style: generation.style,

      colorTheme: generation.colorTheme,

      hasProfilePhoto: profilePhotoReferenceIndex !== null,

      profilePhotoReferenceIndex,

      regenerationInstruction: generation.regenerationInstruction,
    });

    const references: CvReferenceImage[] = [];

    if (sourceDesignReference) {
      references.push(sourceDesignReference);
    }

    if (profilePhotoUrl) {
      references.push({
        url: profilePhotoUrl,

        fileName: 'candidate-profile-photo',
      });
    }

    references.push(...designReferences);

    const sourceDesignInstruction =
      sourceDesignReferenceIndex !== null
        ? `
SOURCE CV DESIGN REFERENCE:

- Reference image ${sourceDesignReferenceIndex} is the previously generated CV.
- Preserve its page size, columns, margins, section positions, spacing,
  typography hierarchy, colors, dividers, icons, and profile-photo placement
  as closely as possible.
- Use the supplied CV data as the only source of factual information.
- Do not copy outdated names, contact details, dates, employers, education,
  skills, or other text from reference image ${sourceDesignReferenceIndex}.
- For a facts-only update, change only the factual content while preserving
  the existing visual design.
- When a new design instruction is supplied, preserve the useful structure
  while applying only the requested visual changes.
        `.trim()
        : null;

    const extendedPrompt = this.extendGenerationPrompt({
      basePrompt,

      generation,

      designReferenceCount: designReferences.length,

      designReferenceStartIndex,

      templateIsPrimary: false,
    });

    const prompt = [sourceDesignInstruction, extendedPrompt]
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0,
      )
      .join('\n\n');

    if (references.length === 0) {
      return this.cvImageGenerationService.generateFromScratch(prompt);
    }

    return this.cvImageGenerationService.generateFromReferences(
      prompt,
      references,
    );
  }

  private extendGenerationPrompt(params: {
    basePrompt: string;

    generation: CvGeneration;

    designReferenceCount: number;

    designReferenceStartIndex: number;

    templateIsPrimary: boolean;
  }): string {
    const sections: string[] = [params.basePrompt];

    if (
      params.generation.templateAnalysis &&
      Object.keys(params.generation.templateAnalysis).length > 0
    ) {
      sections.push(
        `
TEMPLATE ANALYSIS:
${JSON.stringify(params.generation.templateAnalysis, null, 2)}

Use this analysis only to understand layout, section order, colors and visual structure.
Never copy personal sample information from the analysis or template.
      `.trim(),
      );
    }

    if (params.designReferenceCount > 0) {
      const referenceLines = Array.from(
        {
          length: params.designReferenceCount,
        },
        (_, index) => {
          const referenceNumber = params.designReferenceStartIndex + index;

          return `- Reference image ${referenceNumber} is an additional CV design or visual-style reference.`;
        },
      );

      sections.push(
        `
ADDITIONAL DESIGN REFERENCES:
${referenceLines.join('\n')}

- Use these images only for layout, typography, color, spacing or visual inspiration.
- Never copy names, contact details, employment history, education or other personal content from them.
${
  params.templateIsPrimary
    ? '- The selected CV template in reference image 1 remains the primary design reference.'
    : '- Combine useful design ideas into one original, professional and readable CV page.'
}
      `.trim(),
      );
    }

    if (params.generation.assistantSessionId) {
      sections.push(
        `
CHATBOT DATA RULE:
- The candidate data was collected through a CV assistant conversation.
- Field names may be flexible or profession-specific.
- Include all reliable supplied information where it is relevant.
- Do not invent missing information.
- Organize conversational text into professional CV sections without changing factual meaning.
      `.trim(),
      );
    }

    return sections.filter(Boolean).join('\n\n');
  }

  private validateMode(dto: CreateCvGenerationDto): void {
    if (dto.mode === CvGenerationMode.TEMPLATE && !dto.templateId) {
      throw new BadRequestException(
        'templateId is required when mode is template.',
      );
    }

    if (dto.mode === CvGenerationMode.SCRATCH && dto.templateId) {
      throw new BadRequestException(
        'templateId must not be provided when mode is scratch.',
      );
    }
  }

  private validateAssistantGeneration(
    params: CreateCvGenerationFromAssistantParams,
  ): void {
    if (!params.assistantSessionId?.trim()) {
      throw new BadRequestException('assistantSessionId is required.');
    }

    if (params.mode === CvGenerationMode.TEMPLATE && !params.templateId) {
      throw new BadRequestException(
        'A template is required for template CV generation.',
      );
    }

    if (params.mode === CvGenerationMode.SCRATCH && params.templateId) {
      throw new BadRequestException(
        'A template must not be provided for scratch CV generation.',
      );
    }

    if (params.referenceImageFileIds.length > 6) {
      throw new BadRequestException(
        'A maximum of 6 reference images is allowed.',
      );
    }
  }

  private async findOwnedGeneration(
    generationId: string,
    userId: string,
  ): Promise<CvGeneration> {
    const generation = await this.cvGenerationRepository.findOne({
      where: {
        id: generationId,

        userId,
      },
    });

    if (!generation) {
      throw new NotFoundException('CV generation not found.');
    }

    return generation;
  }

  private async createProcessingGeneration(
    currentUser: FileRequestUser,
    values: DeepPartial<CvGeneration>,
  ): Promise<CvGeneration> {
    return this.dataSource.transaction(async (manager) => {
      const isEditOrRegeneration = Boolean(values.sourceGenerationId);

      const editingIsFree =
        isEditOrRegeneration &&
        (await this.storeWalletService.isCvEditingWithoutCreditAllowed(
          manager,
        ));

      let chargeSource = CvGenerationChargeSource.NONE;

      if (!editingIsFree) {
        const charge = await this.storeWalletService.consumeCvGenerationAccess(
          currentUser.id,
          manager,
        );

        chargeSource = charge.source;
      }

      const repository = manager.getRepository(CvGeneration);

      /*
       * Allowance/credit consumption and generation creation
       * happen in one transaction. If either part fails,
       * neither change is committed.
       */
      const generation = repository.create({
        ...values,

        userId: currentUser.id,

        status: CvGenerationStatus.PROCESSING,

        creditChargeSource: chargeSource,

        creditChargedAt:
          chargeSource === CvGenerationChargeSource.NONE ? null : new Date(),

        creditRefundedAt: null,
      });

      return repository.save(generation);
    });
  }

  private async failGenerationAndRefund(
    generationId: string,
    errorMessage: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(CvGeneration);

      /*
       * Lock the generation row so concurrent workers cannot
       * refund the same free allowance or paid credit twice.
       */
      const generation = await repository.findOne({
        where: {
          id: generationId,
        },

        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!generation) {
        return;
      }

      /*
       * Do not overwrite a completed or already finalized generation.
       */
      if (generation.status !== CvGenerationStatus.PROCESSING) {
        return;
      }

      generation.status = CvGenerationStatus.FAILED;

      generation.errorMessage = errorMessage;

      const shouldRefund =
        generation.creditChargeSource !== CvGenerationChargeSource.NONE &&
        !generation.creditRefundedAt;

      if (shouldRefund) {
        await this.storeWalletService.refundCvGenerationAccess(
          generation.userId,
          generation.creditChargeSource,
          manager,
        );

        generation.creditRefundedAt = new Date();
      }

      await repository.save(generation);
    });
  }

  private async assertOwnedProfilePhoto(
    fileId: string,
    userId: string,
  ): Promise<void> {
    const file = await this.filesService.findActiveFileById(fileId);

    if (file.ownerUserId !== userId) {
      throw new ForbiddenException('You cannot use this profile photo.');
    }

    if (!file.mimeType.startsWith('image/')) {
      throw new BadRequestException(
        'The selected profile photo is not an image.',
      );
    }

    if (file.filePurpose !== FilePurpose.CV_PHOTO) {
      throw new BadRequestException(
        'The selected file was not uploaded as a CV photo.',
      );
    }
  }

  private async assertOwnedReferenceImages(
    fileIds: string[],
    userId: string,
  ): Promise<void> {
    await Promise.all(
      fileIds.map((fileId) => this.assertOwnedReferenceImage(fileId, userId)),
    );
  }

  private async assertOwnedReferenceImage(
    fileId: string,
    userId: string,
  ): Promise<void> {
    const file = await this.filesService.findActiveFileById(fileId);

    if (file.ownerUserId !== userId) {
      throw new ForbiddenException('You cannot use this CV reference image.');
    }

    if (!file.mimeType.startsWith('image/')) {
      throw new BadRequestException(
        'The selected CV reference file is not an image.',
      );
    }

    if (file.filePurpose !== FilePurpose.CV_REFERENCE_IMAGE) {
      throw new BadRequestException(
        'The selected reference image was not uploaded with the CV reference purpose.',
      );
    }
  }

  private async getOwnedProfilePhotoSignedUrl(
    fileId: string,
    userId: string,
  ): Promise<string> {
    await this.assertOwnedProfilePhoto(fileId, userId);

    const response = await this.filesService.createSignedReadUrl(fileId);

    return response.signedReadUrl;
  }

  private async getOwnedReferenceImageSignedUrls(
    fileIds: string[],
    userId: string,
  ): Promise<CvReferenceImage[]> {
    return Promise.all(
      fileIds.map(async (fileId, index) => {
        await this.assertOwnedReferenceImage(fileId, userId);

        const response = await this.filesService.createSignedReadUrl(fileId);

        return {
          url: response.signedReadUrl,

          fileName: `cv-design-reference-${index + 1}`,
        };
      }),
    );
  }

  private async mapGenerationResponse(generation: CvGeneration) {
    let generatedImageUrl: string | null = null;

    if (
      generation.status === CvGenerationStatus.COMPLETED &&
      generation.generatedImageFileId
    ) {
      try {
        const signedReadResponse = await this.filesService.createSignedReadUrl(
          generation.generatedImageFileId,
        );

        generatedImageUrl = signedReadResponse.signedReadUrl;
      } catch {
        generatedImageUrl = null;
      }
    }

    return {
      id: generation.id,

      assistantSessionId: generation.assistantSessionId,

      sourceGenerationId: generation.sourceGenerationId,

      mode: generation.mode,

      templateId: generation.templateId,

      status: generation.status,

      cvData: generation.cvData,

      templateAnalysis: generation.templateAnalysis,

      style: generation.style,

      colorTheme: generation.colorTheme,

      regenerationInstruction: generation.regenerationInstruction,

      profilePhotoFileId: generation.profilePhotoFileId,

      referenceImageFileIds: generation.referenceImageFileIds ?? [],

      generatedImageFileId: generation.generatedImageFileId,

      generatedImageUrl,

      errorMessage: generation.errorMessage,

      createdAt: generation.createdAt,

      updatedAt: generation.updatedAt,
    };
  }

  private truncateNullable(
    value: string | null | undefined,
    maxLength: number,
  ): string | null {
    const normalized = value?.trim();

    return normalized ? normalized.slice(0, maxLength) : null;
  }

  private getSafeGenerationError(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();

      if (typeof response === 'string') {
        return response.slice(0, 500);
      }

      if (response && typeof response === 'object' && 'message' in response) {
        const message = (
          response as {
            message?: string | string[];
          }
        ).message;

        if (Array.isArray(message)) {
          return message.join(', ').slice(0, 500);
        }

        if (typeof message === 'string') {
          return message.slice(0, 500);
        }
      }
    }

    return 'The CV image could not be generated. Please try again.';
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

  private async getSourceGenerationDesignReference(
    generation: CvGeneration,
  ): Promise<CvReferenceImage | null> {
    if (!generation.sourceGenerationId) {
      return null;
    }

    const sourceGeneration = await this.cvGenerationRepository.findOne({
      where: {
        id: generation.sourceGenerationId,

        userId: generation.userId,

        status: CvGenerationStatus.COMPLETED,
      },
    });

    if (!sourceGeneration || !sourceGeneration.generatedImageFileId) {
      return null;
    }

    const sourceFile = await this.filesService.findActiveFileById(
      sourceGeneration.generatedImageFileId,
    );

    if (
      sourceFile.ownerUserId !== generation.userId ||
      !sourceFile.mimeType.startsWith('image/') ||
      sourceFile.filePurpose !== FilePurpose.CV_GENERATED_IMAGE
    ) {
      return null;
    }

    const response = await this.filesService.createSignedReadUrl(
      sourceGeneration.generatedImageFileId,
    );

    return {
      url: response.signedReadUrl,

      fileName: 'previous-generated-cv-design',
    };
  }
}
