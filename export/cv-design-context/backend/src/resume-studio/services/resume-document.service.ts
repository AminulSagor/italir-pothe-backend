import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import type {
  AutosaveResumeDocumentDto,
  CreateResumeDocumentDto,
  ResumeDocumentQueryDto,
  ResumeLibraryQueryDto,
} from '../dto/resume-document.dto';
import {
  ResumeDocument,
  ResumeDocumentStatus,
} from '../entities/resume-document.entity';
import {
  ResumeGeneration,
  ResumeGenerationStatus,
} from '../entities/resume-generation.entity';
import {
  ResumeTemplate,
  ResumeTemplateStatus,
} from '../entities/resume-template.entity';
import { ResumeAssetService } from './resume-asset.service';
import { ResumeCreditService } from './resume-credit.service';
import { ResumeRendererService } from './resume-renderer.service';
import { ResumeSchemaService } from './resume-schema.service';
import { ResumeStorageService } from './resume-storage.service';
import { ResumeTemplateService } from './resume-template.service';

@Injectable()
export class ResumeDocumentService {
  constructor(
    @InjectRepository(ResumeDocument)
    private readonly documentRepository: Repository<ResumeDocument>,
    @InjectRepository(ResumeGeneration)
    private readonly generationRepository: Repository<ResumeGeneration>,
    @InjectRepository(ResumeTemplate)
    private readonly templateRepository: Repository<ResumeTemplate>,
    private readonly dataSource: DataSource,
    private readonly schemaService: ResumeSchemaService,
    private readonly templateService: ResumeTemplateService,
    private readonly rendererService: ResumeRendererService,
    private readonly assetService: ResumeAssetService,
    private readonly storageService: ResumeStorageService,
    private readonly creditService: ResumeCreditService,
  ) {}

  /**
   * Creating a draft is intentionally free. Resume Studio consumes one free
   * creation/paid credit only after the first PDF renders successfully. This
   * avoids charging users for opening a template or abandoning an empty draft.
   */
  async create(userId: string, dto: CreateResumeDocumentDto) {
    if (dto.templateId) {
      await this.templateService.getPublishedTemplate(dto.templateId);

      const existing = await this.findWorkspaceForTemplate(
        userId,
        dto.templateId,
      );

      if (existing) {
        return existing;
      }
    }

    const data = dto.data
      ? this.schemaService.normalizeResumeData(dto.data)
      : {};

    const document = this.documentRepository.create({
      userId,
      title: dto.title.trim(),
      templateId: dto.templateId ?? null,
      data,
      revision: 1,
      status: ResumeDocumentStatus.DRAFT,
      creationChargedAt: null,
      creationChargeSource: null,
      lastAutosavedAt: new Date(),
    });

    try {
      return await this.documentRepository.save(document);
    } catch (error) {
      /*
       * The partial unique index is the final authority. If two devices open
       * the same template at the same time, one insert wins and the other
       * simply resumes that workspace instead of surfacing a database error.
       */
      if (dto.templateId && this.isUniqueViolation(error)) {
        const existing = await this.findWorkspaceForTemplate(
          userId,
          dto.templateId,
        );
        if (existing) return existing;
      }
      throw error;
    }
  }

  async autosave(
    userId: string,
    documentId: string,
    dto: AutosaveResumeDocumentDto,
  ) {
    const document = await this.requireOwnedDocument(userId, documentId);

    if (dto.expectedRevision && dto.expectedRevision !== document.revision) {
      throw new ConflictException({
        message: 'CV draft changed on another client',
        currentRevision: document.revision,
      });
    }

    if (dto.templateId !== undefined) {
      await this.templateService.getPublishedTemplate(dto.templateId);

      if (document.templateId && document.templateId !== dto.templateId) {
        throw new BadRequestException(
          'A CV workspace cannot be moved to another template. Open that template instead.',
        );
      }

      if (!document.templateId) {
        const existing = await this.findWorkspaceForTemplate(
          userId,
          dto.templateId,
        );
        if (existing && existing.id !== document.id) {
          throw new ConflictException(
            'A CV workspace already exists for this template',
          );
        }
        document.templateId = dto.templateId;
      }
    }

    if (dto.title !== undefined) {
      document.title = dto.title.trim();
    }

    if (dto.data !== undefined) {
      document.data = this.schemaService.normalizeResumeData(dto.data);
    }

    document.revision += 1;
    document.lastAutosavedAt = new Date();

    return this.documentRepository.save(document);
  }

  async get(userId: string, documentId: string) {
    return this.requireOwnedDocument(userId, documentId);
  }

  async list(userId: string, query: ResumeDocumentQueryDto) {
    const [items, total] = await this.documentRepository.findAndCount({
      where: { userId },
      order: { updatedAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
    };
  }


  /**
   * Dedicated My CVs page payload. One row represents one template workspace.
   * Full CV JSON and signed PDF URLs are intentionally omitted so the page
   * stays light; those are fetched only after the user taps Edit or View.
   */
  async listLibrary(userId: string, query: ResumeLibraryQueryDto) {
    const baseQuery = this.documentRepository
      .createQueryBuilder('document')
      .where('document.userId = :userId', { userId })
      .andWhere('document.templateId IS NOT NULL')
      .andWhere('document.status != :archived', {
        archived: ResumeDocumentStatus.ARCHIVED,
      });

    const total = await baseQuery.clone().getCount();
    const documents = await baseQuery
      .clone()
      .orderBy('document.updatedAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();

    if (documents.length === 0) {
      return {
        items: [],
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      };
    }

    const documentIds = documents.map((document) => document.id);
    const templateIds = Array.from(
      new Set(
        documents
          .map((document) => document.templateId)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const [generations, templates] = await Promise.all([
      this.generationRepository.find({
        where: {
          userId,
          documentId: In(documentIds),
          status: ResumeGenerationStatus.COMPLETED,
        },
        order: { createdAt: 'DESC' },
      }),
      templateIds.length > 0
        ? this.templateRepository.find({
            where: { id: In(templateIds) },
          })
        : Promise.resolve([] as ResumeTemplate[]),
    ]);

    const generationByDocumentId = new Map<string, ResumeGeneration>();
    for (const generation of generations) {
      if (!generationByDocumentId.has(generation.documentId)) {
        generationByDocumentId.set(generation.documentId, generation);
      }
    }

    const templateById = new Map(
      templates.map((template) => [template.id, template] as const),
    );

    const items = await Promise.all(
      documents.map(async (document) => {
        const generation = generationByDocumentId.get(document.id) ?? null;
        const template = document.templateId
          ? templateById.get(document.templateId)
          : undefined;

        return {
          documentId: document.id,
          title: document.title,
          templateId: document.templateId,
          templateName: template?.name ?? 'CV template',
          templateCategory: template?.category ?? null,
          templateAvailable: Boolean(
            template &&
              template.status === ResumeTemplateStatus.PUBLISHED &&
              template.publishedVersionId,
          ),
          previewImageUrl: template?.previewImageStorageKey
            ? await this.storageService.signedImage(
                template.previewImageStorageKey,
              )
            : null,
          revision: document.revision,
          status: document.status,
          updatedAt: document.updatedAt,
          creationChargedAt: document.creationChargedAt,
          editingIsFree: Boolean(document.creationChargedAt),
          hasDraftChanges:
            generation == null ||
            generation.documentRevision == null ||
            generation.documentRevision < document.revision,
          latestGeneration: generation
            ? {
                id: generation.id,
                documentRevision: generation.documentRevision,
                pageCount: generation.pageCount,
                warnings: generation.warnings,
                createdAt: generation.createdAt,
                hasPdf: true,
              }
            : null,
        };
      }),
    );

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  /**
   * Lightweight home-screen history. It deliberately omits the full CV JSON so
   * the template gallery stays fast. The full document is fetched only when the
   * user taps Continue/Edit.
   */
  async listRecent(userId: string, limit = 4) {
    const normalizedLimit = Math.min(8, Math.max(1, limit));

    const documents = await this.documentRepository
      .createQueryBuilder('document')
      .where('document.userId = :userId', { userId })
      .andWhere('document.status != :archived', {
        archived: ResumeDocumentStatus.ARCHIVED,
      })
      .orderBy('document.updatedAt', 'DESC')
      .take(normalizedLimit)
      .getMany();

    if (documents.length === 0) {
      return [];
    }

    const documentIds = documents.map((document) => document.id);

    // PostgreSQL DISTINCT ON returns only the latest completed generation for
    // each recent document, including legacy documents that may still have a
    // long generation history.
    const generations = await this.generationRepository
      .createQueryBuilder('generation')
      .distinctOn(['generation.documentId'])
      .where('generation.userId = :userId', { userId })
      .andWhere('generation.documentId IN (:...documentIds)', { documentIds })
      .andWhere('generation.status = :status', {
        status: ResumeGenerationStatus.COMPLETED,
      })
      .orderBy('generation.documentId', 'ASC')
      .addOrderBy('generation.createdAt', 'DESC')
      .getMany();

    const latestGenerationByDocumentId = new Map<string, ResumeGeneration>();

    for (const generation of generations) {
      if (!latestGenerationByDocumentId.has(generation.documentId)) {
        latestGenerationByDocumentId.set(generation.documentId, generation);
      }
    }

    return Promise.all(
      documents.map(async (document) => {
        const generation = latestGenerationByDocumentId.get(document.id);

        return {
          id: document.id,
          title: document.title,
          templateId: document.templateId,
          revision: document.revision,
          status: document.status,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
          creationChargedAt: document.creationChargedAt,
          creationChargeSource: document.creationChargeSource,
          editingIsFree: Boolean(document.creationChargedAt),
          latestGeneration: generation
            ? {
                id: generation.id,
                templateId: generation.templateId,
                pageCount: generation.pageCount,
                warnings: generation.warnings,
                createdAt: generation.createdAt,
                hasPdf: true,
              }
            : null,
        };
      }),
    );
  }

  async archive(userId: string, documentId: string) {
    const document = await this.requireOwnedDocument(userId, documentId);
    document.status = ResumeDocumentStatus.ARCHIVED;
    return this.documentRepository.save(document);
  }

  async render(
    userId: string,
    documentId: string,
    overrideTemplateId?: string,
  ) {
    const document = await this.requireOwnedDocument(userId, documentId);

    if (
      overrideTemplateId &&
      document.templateId &&
      overrideTemplateId !== document.templateId
    ) {
      throw new BadRequestException(
        'A CV workspace cannot be rendered with another template. Open that template instead.',
      );
    }

    const templateId = document.templateId ?? overrideTemplateId;

    if (!templateId) {
      throw new BadRequestException('Select a CV template before rendering');
    }

    const { template, version } =
      await this.templateService.getPublishedTemplate(templateId);

    const normalizedData = this.schemaService.normalizeResumeData(
      document.data as unknown as Record<string, unknown>,
      version.fieldSchema,
    );

    const templateData = this.schemaService.applyTemplateVisibility(
      normalizedData,
      version.fieldSchema,
    );

    const contentHash = createHash('sha256')
      .update(
        JSON.stringify({
          documentId: document.id,
          templateId,
          templateVersionId: version.id,
          templateChecksum: version.checksum,
          data: templateData,
        }),
      )
      .digest('hex');

    /*
     * Cache hits are valid only for documents whose first creation was already
     * charged. New drafts can never bypass first-creation charging through a
     * stale/pre-migration generation record.
     */
    if (document.creationChargedAt) {
      const cached = await this.generationRepository.findOne({
        where: {
          userId,
          contentHash,
          status: ResumeGenerationStatus.COMPLETED,
        },
      });

      if (cached && (await this.storageService.exists(cached.pdfStorageKey))) {
        if (cached.documentRevision !== document.revision) {
          cached.documentRevision = document.revision;
          await this.generationRepository.save(cached);
        }

        return {
          ...(await this.toGenerationResponse(cached, document.title, true)),
          creation: {
            chargedNow: false,
            source: document.creationChargeSource,
            editingIsFree: true,
          },
          access: await this.creditService.getAccess(userId),
        };
      }
    }

    /*
     * Chromium work happens before the billing transaction. A validation or
     * rendering failure therefore never consumes a free creation/paid credit.
     */
    const renderData = await this.assetService.resolveForRender(
      userId,
      templateData,
    );

    const rendered = await this.rendererService.render({
      html: version.html,
      css: version.css,
      data: renderData,
      rendererConfig: version.rendererConfig,
    });

    const transactionResult = await this.dataSource.transaction(
      async (manager) => {
        const lockedDocument = await manager
          .getRepository(ResumeDocument)
          .findOne({
            where: {
              id: document.id,
              userId,
            },
            lock: {
              mode: 'pessimistic_write',
            },
          });

        if (!lockedDocument) {
          throw new NotFoundException('CV draft was not found');
        }

        if (lockedDocument.revision !== document.revision) {
          throw new ConflictException(
            'CV changed while the PDF was being created. Please create the PDF again.',
          );
        }

        const charge = await this.creditService.chargeFirstSuccessfulCreation(
          userId,
          lockedDocument,
          manager,
        );

        /*
         * One stable S3 key per document keeps free CVs inexpensive to store.
         * Every edit replaces latest.pdf instead of accumulating files.
         * Keeping this inside the transaction also rolls back the credit if the
         * S3 upload itself fails.
         */
        const pdfStorageKey = await this.storageService.storeGeneratedPdf({
          userId,
          documentId: lockedDocument.id,
          buffer: rendered.pdfBuffer,
        });

        const generationRepository = manager.getRepository(ResumeGeneration);

        /*
         * Resume Studio only needs the latest generation metadata because the
         * PDF object itself is also latest-only. This prevents unbounded DB rows
         * during repeated free edits.
         */
        await generationRepository.delete({
          userId,
          documentId: lockedDocument.id,
        });

        const generation = await generationRepository.save(
          generationRepository.create({
            userId,
            documentId: lockedDocument.id,
            templateId: template.id,
            templateVersionId: version.id,
            templateVersionNumber: version.versionNumber,
            documentRevision: lockedDocument.revision,
            contentHash,
            pdfStorageKey,
            pageCount: rendered.pageCount,
            warnings: rendered.warnings,
            status: ResumeGenerationStatus.COMPLETED,
          }),
        );

        lockedDocument.templateId = template.id;
        lockedDocument.status = ResumeDocumentStatus.ACTIVE;
        await manager.getRepository(ResumeDocument).save(lockedDocument);

        return {
          generation,
          title: lockedDocument.title,
          charge,
        };
      },
    );

    return {
      ...(await this.toGenerationResponse(
        transactionResult.generation,
        transactionResult.title,
        false,
      )),
      creation: {
        chargedNow: transactionResult.charge.newlyCharged,
        source: transactionResult.charge.source,
        editingIsFree: true,
      },
      access: await this.creditService.getAccess(userId),
    };
  }

  async generation(userId: string, generationId: string) {
    const generation = await this.generationRepository.findOne({
      where: {
        id: generationId,
        userId,
      },
    });

    if (!generation) {
      throw new NotFoundException('Generated CV was not found');
    }

    const document = await this.documentRepository.findOne({
      where: {
        id: generation.documentId,
        userId,
      },
    });

    return this.toGenerationResponse(
      generation,
      document?.title ?? 'cv',
      true,
    );
  }

  private async toGenerationResponse(
    generation: ResumeGeneration,
    title: string,
    cached: boolean,
  ) {
    return {
      id: generation.id,
      documentId: generation.documentId,
      templateId: generation.templateId,
      documentRevision: generation.documentRevision,
      pageCount: generation.pageCount,
      warnings: generation.warnings,
      cached,
      createdAt: generation.createdAt,
      pdfUrl: await this.storageService.signedPdf(
        generation.pdfStorageKey,
        `${this.safeTitle(title)}.pdf`,
      ),
    };
  }

  private async findWorkspaceForTemplate(
    userId: string,
    templateId: string,
  ): Promise<ResumeDocument | null> {
    return this.documentRepository
      .createQueryBuilder('document')
      .where('document.userId = :userId', { userId })
      .andWhere('document.templateId = :templateId', { templateId })
      .andWhere('document.status != :archived', {
        archived: ResumeDocumentStatus.ARCHIVED,
      })
      .orderBy('document.updatedAt', 'DESC')
      .getOne();
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string } | undefined;
    return driverError?.code === '23505';
  }

  private safeTitle(title: string): string {
    return (
      title
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'cv'
    );
  }

  private async requireOwnedDocument(
    userId: string,
    id: string,
  ): Promise<ResumeDocument> {
    const document = await this.documentRepository.findOne({
      where: {
        id,
        userId,
      },
    });

    if (!document) {
      throw new NotFoundException('CV draft was not found');
    }

    return document;
  }
}
