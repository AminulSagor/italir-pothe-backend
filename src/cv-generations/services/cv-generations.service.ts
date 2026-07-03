import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CvTemplatesService } from 'src/cv-templates/services/cv-templates.service';
import { FilePurpose } from 'src/files/entities/file.entity';
import {
  FilesService,
  type FileRequestUser,
} from 'src/files/services/files.service';

import { CreateCvGenerationDto } from '../dto/create-cv-generation.dto';
import type { CvDataDto } from '../dto/cv-data.dto';
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

  mode: CvGenerationMode;

  templateId: string | null;

  cvData: Record<string, unknown>;

  templateAnalysis: Record<string, unknown> | null;

  style?: string | null;

  colorTheme?: string | null;

  profilePhotoFileId: string | null;

  referenceImageFileIds: string[];
}

@Injectable()
export class CvGenerationsService {
  private readonly logger = new Logger(CvGenerationsService.name);

  constructor(
    @InjectRepository(CvGeneration)
    private readonly cvGenerationRepository: Repository<CvGeneration>,

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

    const generation = this.cvGenerationRepository.create({
      userId: currentUser.id,

      assistantSessionId: null,

      mode: dto.mode,

      templateId: dto.templateId ?? null,

      status: CvGenerationStatus.PROCESSING,

      cvData: dto.cvData as unknown as Record<string, unknown>,

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

      profilePhotoFileId: dto.profilePhotoFileId ?? null,

      referenceImageFileIds: [],

      generatedImageFileId: null,

      errorMessage: null,
    });

    const savedGeneration = await this.cvGenerationRepository.save(generation);

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

    const generation = this.cvGenerationRepository.create({
      userId: currentUser.id,

      assistantSessionId: params.assistantSessionId,

      mode: params.mode,

      templateId: params.templateId,

      status: CvGenerationStatus.PROCESSING,

      cvData: params.cvData ?? {},

      templateAnalysis: params.templateAnalysis,

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

      profilePhotoFileId: params.profilePhotoFileId,

      referenceImageFileIds,

      generatedImageFileId: null,

      errorMessage: null,
    });

    const savedGeneration = await this.cvGenerationRepository.save(generation);

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

  async regenerate(generationId: string, currentUser: FileRequestUser) {
    const originalGeneration = await this.findOwnedGeneration(
      generationId,
      currentUser.id,
    );

    if (originalGeneration.profilePhotoFileId) {
      await this.assertOwnedProfilePhoto(
        originalGeneration.profilePhotoFileId,
        currentUser.id,
      );
    }

    await this.assertOwnedReferenceImages(
      originalGeneration.referenceImageFileIds ?? [],
      currentUser.id,
    );

    if (
      originalGeneration.mode === CvGenerationMode.TEMPLATE &&
      originalGeneration.templateId
    ) {
      await this.cvTemplatesService.findById(originalGeneration.templateId);
    }

    const newGeneration = this.cvGenerationRepository.create({
      userId: originalGeneration.userId,

      assistantSessionId: originalGeneration.assistantSessionId,

      mode: originalGeneration.mode,

      templateId: originalGeneration.templateId,

      status: CvGenerationStatus.PROCESSING,

      cvData: originalGeneration.cvData,

      templateAnalysis: originalGeneration.templateAnalysis,

      style: originalGeneration.style,

      colorTheme: originalGeneration.colorTheme,

      profilePhotoFileId: originalGeneration.profilePhotoFileId,

      referenceImageFileIds: [
        ...(originalGeneration.referenceImageFileIds ?? []),
      ],

      generatedImageFileId: null,

      errorMessage: null,
    });

    const savedGeneration =
      await this.cvGenerationRepository.save(newGeneration);

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
      const cvData = generation.cvData as unknown as CvDataDto;

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
        generatedImageBuffer = await this.processTemplateGeneration({
          generation,
          cvData,
          profilePhotoUrl,
          designReferences,
        });
      } else {
        generatedImageBuffer = await this.processScratchGeneration({
          generation,
          cvData,
          profilePhotoUrl,
          designReferences,
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
      generation.status = CvGenerationStatus.FAILED;

      generation.errorMessage = this.getSafeGenerationError(error);

      await this.cvGenerationRepository.save(generation);

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

    const basePrompt = this.cvPromptService.buildTemplatePrompt(
      cvData,
      Boolean(profilePhotoUrl),
    );

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

    const designReferenceStartIndex = profilePhotoUrl ? 3 : 2;

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
  }): Promise<Buffer> {
    const { generation, cvData, profilePhotoUrl, designReferences } = params;

    const basePrompt = this.cvPromptService.buildScratchPrompt({
      cvData,

      style: generation.style,

      colorTheme: generation.colorTheme,

      hasProfilePhoto: Boolean(profilePhotoUrl),
    });

    const references: CvReferenceImage[] = [];

    if (profilePhotoUrl) {
      references.push({
        url: profilePhotoUrl,

        fileName: 'candidate-profile-photo',
      });
    }

    references.push(...designReferences);

    const designReferenceStartIndex = profilePhotoUrl ? 2 : 1;

    const prompt = this.extendGenerationPrompt({
      basePrompt,

      generation,

      designReferenceCount: designReferences.length,

      designReferenceStartIndex,

      templateIsPrimary: false,
    });

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

      mode: generation.mode,

      templateId: generation.templateId,

      status: generation.status,

      cvData: generation.cvData,

      templateAnalysis: generation.templateAnalysis,

      style: generation.style,

      colorTheme: generation.colorTheme,

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
}
