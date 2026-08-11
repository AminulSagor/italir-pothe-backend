import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import type {
  AutosaveResumeDocumentDto,
  CreateResumeDocumentDto,
  ResumeDocumentQueryDto,
} from '../dto/resume-document.dto';
import {
  ResumeDocument,
  ResumeDocumentStatus,
} from '../entities/resume-document.entity';
import {
  ResumeGeneration,
  ResumeGenerationStatus,
} from '../entities/resume-generation.entity';
import { ResumeAssetService } from './resume-asset.service';
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
    private readonly schemaService: ResumeSchemaService,
    private readonly templateService: ResumeTemplateService,
    private readonly rendererService: ResumeRendererService,
    private readonly assetService: ResumeAssetService,
    private readonly storageService: ResumeStorageService,
  ) {}

  async create(userId: string, dto: CreateResumeDocumentDto) {
    if (dto.templateId) await this.templateService.getPublishedTemplate(dto.templateId);
    const data = dto.data ? this.schemaService.normalizeResumeData(dto.data) : {};
    return this.documentRepository.save(
      this.documentRepository.create({
        userId,
        title: dto.title.trim(),
        templateId: dto.templateId ?? null,
        data,
        revision: 1,
        status: ResumeDocumentStatus.DRAFT,
        lastAutosavedAt: new Date(),
      }),
    );
  }

  async autosave(userId: string, documentId: string, dto: AutosaveResumeDocumentDto) {
    const document = await this.requireOwnedDocument(userId, documentId);
    if (dto.expectedRevision && dto.expectedRevision !== document.revision) {
      throw new ConflictException({
        message: 'CV draft changed on another client',
        currentRevision: document.revision,
      });
    }

    if (dto.templateId !== undefined) {
      await this.templateService.getPublishedTemplate(dto.templateId);
      document.templateId = dto.templateId;
    }
    if (dto.title !== undefined) document.title = dto.title.trim();
    if (dto.data !== undefined) document.data = this.schemaService.normalizeResumeData(dto.data);
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
    return { items, total, page: query.page, limit: query.limit };
  }

  async archive(userId: string, documentId: string) {
    const document = await this.requireOwnedDocument(userId, documentId);
    document.status = ResumeDocumentStatus.ARCHIVED;
    return this.documentRepository.save(document);
  }

  async render(userId: string, documentId: string, overrideTemplateId?: string) {
    const document = await this.requireOwnedDocument(userId, documentId);
    const templateId = overrideTemplateId ?? document.templateId;
    if (!templateId) throw new BadRequestException('Select a CV template before rendering');

    const { template, version } = await this.templateService.getPublishedTemplate(templateId);
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

    const cached = await this.generationRepository.findOne({
      where: { userId, contentHash, status: ResumeGenerationStatus.COMPLETED },
    });
    if (cached && (await this.storageService.exists(cached.pdfStorageKey))) {
      return this.toGenerationResponse(cached, document.title, true);
    }

    const renderData = await this.assetService.resolveForRender(userId, templateData);
    const rendered = await this.rendererService.render({
      html: version.html,
      css: version.css,
      data: renderData,
      rendererConfig: version.rendererConfig,
    });

    const pdfStorageKey = await this.storageService.storeGeneratedPdf({
      userId,
      documentId,
      contentHash,
      buffer: rendered.pdfBuffer,
    });

    const generation = await this.generationRepository.save(
      this.generationRepository.create({
        userId,
        documentId,
        templateId: template.id,
        templateVersionId: version.id,
        templateVersionNumber: version.versionNumber,
        contentHash,
        pdfStorageKey,
        pageCount: rendered.pageCount,
        warnings: rendered.warnings,
        status: ResumeGenerationStatus.COMPLETED,
      }),
    );

    document.templateId = template.id;
    document.status = ResumeDocumentStatus.ACTIVE;
    await this.documentRepository.save(document);

    return this.toGenerationResponse(generation, document.title, false);
  }

  async generation(userId: string, generationId: string) {
    const generation = await this.generationRepository.findOne({
      where: { id: generationId, userId },
    });
    if (!generation) throw new NotFoundException('Generated CV was not found');
    const document = await this.documentRepository.findOne({ where: { id: generation.documentId, userId } });
    return this.toGenerationResponse(generation, document?.title ?? 'cv', true);
  }

  private async toGenerationResponse(
    generation: ResumeGeneration,
    title: string,
    cached: boolean,
  ) {
    const safeTitle = title.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'cv';
    return {
      id: generation.id,
      documentId: generation.documentId,
      templateId: generation.templateId,
      pageCount: generation.pageCount,
      warnings: generation.warnings,
      cached,
      pdfUrl: await this.storageService.signedPdf(
        generation.pdfStorageKey,
        `${safeTitle}.pdf`,
      ),
    };
  }

  private async requireOwnedDocument(userId: string, id: string): Promise<ResumeDocument> {
    const document = await this.documentRepository.findOne({ where: { id, userId } });
    if (!document) throw new NotFoundException('CV draft was not found');
    return document;
  }
}
