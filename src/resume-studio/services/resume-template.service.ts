import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import {
  ResumeTemplate,
  ResumeTemplateStatus,
} from '../entities/resume-template.entity';
import {
  ResumeTemplateVersion,
  ResumeTemplateVersionStatus,
} from '../entities/resume-template-version.entity';
import type {
  ResumeRendererConfig,
  ResumeTemplateFieldSchema,
} from '../types/template-schema.types';
import type {
  CreateResumeTemplateDto,
  InferResumeTemplateFieldSchemaDto,
  PreviewResumeTemplateDto,
  ResumeTemplateAdminQueryDto,
  SaveResumeTemplateDraftDto,
  UpdateResumeTemplateMetadataDto,
} from '../dto/admin-resume-template.dto';
import type { ResumeTemplateQueryDto } from '../dto/resume-document.dto';
import type { ResumeData } from '../types/resume-data.types';
import { RESUME_PREVIEW_SAMPLE } from '../testing/resume-sample.fixture';
import { DEFAULT_RESUME_FIELD_SCHEMA } from '../constants/resume-field-catalog';
import { ResumeRendererService } from './resume-renderer.service';
import { ResumeSchemaService } from './resume-schema.service';
import { ResumeStorageService } from './resume-storage.service';
import { ResumeTemplateSecurityService } from './resume-template-security.service';
import { ResumeTemplateFieldInferenceService } from './resume-template-field-inference.service';

@Injectable()
export class ResumeTemplateService {
  constructor(
    @InjectRepository(ResumeTemplate)
    private readonly templateRepository: Repository<ResumeTemplate>,
    @InjectRepository(ResumeTemplateVersion)
    private readonly versionRepository: Repository<ResumeTemplateVersion>,
    private readonly schemaService: ResumeSchemaService,
    private readonly securityService: ResumeTemplateSecurityService,
    private readonly fieldInferenceService: ResumeTemplateFieldInferenceService,
    private readonly rendererService: ResumeRendererService,
    private readonly storageService: ResumeStorageService,
  ) {}

  async create(adminId: string, dto: CreateResumeTemplateDto) {
    const existing = await this.templateRepository.findOne({ where: { slug: dto.slug } });
    if (existing) throw new BadRequestException('Template slug already exists');

    const source = this.validateSource(dto);
    const template = await this.templateRepository.save(
      this.templateRepository.create({
        name: dto.name.trim(),
        slug: dto.slug.trim().toLowerCase(),
        description: dto.description?.trim() || null,
        category: dto.category.trim().toLowerCase(),
        isPremium: dto.isPremium ?? false,
        sortOrder: dto.sortOrder ?? 0,
        status: ResumeTemplateStatus.DRAFT,
        createdByAdminId: adminId,
        updatedByAdminId: adminId,
      }),
    );

    const version = await this.versionRepository.save(
      this.versionRepository.create({
        templateId: template.id,
        versionNumber: 1,
        status: ResumeTemplateVersionStatus.DRAFT,
        ...source,
        createdByAdminId: adminId,
      }),
    );

    return { template, draftVersion: version };
  }

  async updateMetadata(adminId: string, templateId: string, dto: UpdateResumeTemplateMetadataDto) {
    const template = await this.requireTemplate(templateId);
    if (dto.name !== undefined) template.name = dto.name.trim();
    if (dto.description !== undefined) template.description = dto.description.trim() || null;
    if (dto.category !== undefined) template.category = dto.category.trim().toLowerCase();
    if (dto.isPremium !== undefined) template.isPremium = dto.isPremium;
    if (dto.sortOrder !== undefined) template.sortOrder = dto.sortOrder;
    template.updatedByAdminId = adminId;
    return this.templateRepository.save(template);
  }

  async saveDraft(adminId: string, templateId: string, dto: SaveResumeTemplateDraftDto) {
    const template = await this.requireTemplate(templateId);
    const source = this.validateSource(dto);
    const latest = await this.versionRepository.findOne({
      where: { templateId },
      order: { versionNumber: 'DESC' },
    });

    if (latest?.status === ResumeTemplateVersionStatus.DRAFT) {
      latest.html = source.html;
      latest.css = source.css;
      latest.fieldSchema = source.fieldSchema;
      latest.rendererConfig = source.rendererConfig;
      latest.checksum = source.checksum;
      latest.createdByAdminId = adminId;
      return this.versionRepository.save(latest);
    }

    return this.versionRepository.save(
      this.versionRepository.create({
        templateId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        status: ResumeTemplateVersionStatus.DRAFT,
        ...source,
        createdByAdminId: adminId,
      }),
    );
  }

  inferFieldSchema(dto: InferResumeTemplateFieldSchemaDto) {
    this.securityService.validate(dto.html, '');
    const currentSchema = dto.currentFieldSchema
      ? this.schemaService.validateTemplateSchema(dto.currentFieldSchema)
      : DEFAULT_RESUME_FIELD_SCHEMA;

    return this.fieldInferenceService.infer(dto.html, currentSchema);
  }

  async previewUnsaved(dto: PreviewResumeTemplateDto) {
    const source = this.validateSource(dto);
    const normalized = dto.sampleData
      ? this.schemaService.normalizeResumeData(dto.sampleData, source.fieldSchema)
      : this.withDefaultPreviewPhoto(
          this.schemaService.normalizeResumeData(
            RESUME_PREVIEW_SAMPLE as unknown as Record<string, unknown>,
            source.fieldSchema,
          ),
          source.fieldSchema,
        );
    const data = this.schemaService.applyTemplateVisibility(
      normalized,
      source.fieldSchema,
    );
    return this.rendererService.render({
      html: source.html,
      css: source.css,
      data,
      rendererConfig: source.rendererConfig,
    });
  }

  async publish(adminId: string, templateId: string) {
    const template = await this.requireTemplate(templateId);
    const draft = await this.versionRepository.findOne({
      where: { templateId, status: ResumeTemplateVersionStatus.DRAFT },
      order: { versionNumber: 'DESC' },
    });
    if (!draft) throw new BadRequestException('No draft version is available to publish');

    const previewData = this.schemaService.applyTemplateVisibility(
      this.withDefaultPreviewPhoto(
        this.schemaService.normalizeResumeData(
          RESUME_PREVIEW_SAMPLE as unknown as Record<string, unknown>,
          draft.fieldSchema,
        ),
        draft.fieldSchema,
      ),
      draft.fieldSchema,
    );
    const preview = await this.rendererService.render({
      html: draft.html,
      css: draft.css,
      data: previewData,
      rendererConfig: draft.rendererConfig,
    });

    const stored = await this.storageService.storeTemplatePreview({
      templateId,
      versionNumber: draft.versionNumber,
      pdfBuffer: preview.pdfBuffer,
      imageBuffer: preview.previewImageBuffer,
    });

    if (template.publishedVersionId) {
      await this.versionRepository.update(
        { id: template.publishedVersionId },
        { status: ResumeTemplateVersionStatus.ARCHIVED },
      );
    }

    draft.status = ResumeTemplateVersionStatus.PUBLISHED;
    draft.publishedAt = new Date();
    await this.versionRepository.save(draft);

    template.status = ResumeTemplateStatus.PUBLISHED;
    template.publishedVersionId = draft.id;
    template.publishedVersionNumber = draft.versionNumber;
    template.previewPdfStorageKey = stored.pdfStorageKey;
    template.previewImageStorageKey = stored.imageStorageKey;
    template.updatedByAdminId = adminId;
    await this.templateRepository.save(template);

    return this.getAdminDetail(templateId);
  }

  async archive(adminId: string, templateId: string) {
    const template = await this.requireTemplate(templateId);
    template.status = ResumeTemplateStatus.ARCHIVED;
    template.updatedByAdminId = adminId;
    return this.templateRepository.save(template);
  }

  async listAdmin(query: ResumeTemplateAdminQueryDto) {
    const qb = this.templateRepository.createQueryBuilder('template');
    if (query.search?.trim()) {
      qb.andWhere('(template.name ILIKE :search OR template.slug ILIKE :search OR template.description ILIKE :search)', {
        search: `%${query.search.trim()}%`,
      });
    }
    if (query.category?.trim()) qb.andWhere('template.category = :category', { category: query.category.trim().toLowerCase() });
    if (query.status?.trim()) qb.andWhere('template.status = :status', { status: query.status.trim().toLowerCase() });
    qb.orderBy('template.sortOrder', 'ASC').addOrderBy('template.createdAt', 'DESC');
    qb.skip((query.page - 1) * query.limit).take(query.limit);
    const [templates, total] = await qb.getManyAndCount();
    const items = await Promise.all(
      templates.map(async (template) => ({
        ...template,
        previewPdfUrl: template.previewPdfStorageKey
          ? await this.storageService.signedPdf(
              template.previewPdfStorageKey,
              `${template.slug}-preview.pdf`,
            )
          : null,
        previewImageUrl: template.previewImageStorageKey
          ? await this.storageService.signedImage(template.previewImageStorageKey)
          : null,
      })),
    );
    return { items, total, page: query.page, limit: query.limit };
  }

  async getAdminDetail(templateId: string) {
    const template = await this.requireTemplate(templateId);
    const versions = await this.versionRepository.find({
      where: { templateId },
      order: { versionNumber: 'DESC' },
    });
    return {
      template,
      versions,
      previewPdfUrl: template.previewPdfStorageKey
        ? await this.storageService.signedPdf(
            template.previewPdfStorageKey,
            `${template.slug}-preview.pdf`,
          )
        : null,
      previewImageUrl: template.previewImageStorageKey
        ? await this.storageService.signedImage(template.previewImageStorageKey)
        : null,
    };
  }

  async listPublished(query: ResumeTemplateQueryDto) {
    const qb = this.templateRepository
      .createQueryBuilder('template')
      .where('template.status = :status', { status: ResumeTemplateStatus.PUBLISHED })
      .andWhere('template.publishedVersionId IS NOT NULL');
    if (query.search?.trim()) {
      qb.andWhere('(template.name ILIKE :search OR template.description ILIKE :search)', {
        search: `%${query.search.trim()}%`,
      });
    }
    if (query.category?.trim()) qb.andWhere('template.category = :category', { category: query.category.trim().toLowerCase() });
    qb.orderBy('template.sortOrder', 'ASC').addOrderBy('template.name', 'ASC');
    qb.skip((query.page - 1) * query.limit).take(query.limit);
    const [templates, total] = await qb.getManyAndCount();

    const items = await Promise.all(
      templates.map(async (template) => {
        const version = await this.requirePublishedVersion(template);
        return {
          id: template.id,
          slug: template.slug,
          name: template.name,
          description: template.description,
          category: template.category,
          isPremium: template.isPremium,
          version: version.versionNumber,
          fieldSchema: version.fieldSchema,
          rendererConfig: version.rendererConfig,
          previewImageUrl: template.previewImageStorageKey
            ? await this.storageService.signedImage(template.previewImageStorageKey)
            : null,
          previewPdfUrl: template.previewPdfStorageKey
            ? await this.storageService.signedPdf(
                template.previewPdfStorageKey,
                `${template.slug}-preview.pdf`,
              )
            : null,
        };
      }),
    );

    return { items, total, page: query.page, limit: query.limit };
  }

  async getPublishedPreview(templateId: string) {
    const { template, version } = await this.getPublishedTemplate(templateId);

    return {
      templateId: template.id,
      slug: template.slug,
      version: version.versionNumber,
      previewImageUrl: template.previewImageStorageKey
        ? await this.storageService.signedImage(template.previewImageStorageKey)
        : null,
      previewPdfUrl: template.previewPdfStorageKey
        ? await this.storageService.signedPdf(
            template.previewPdfStorageKey,
            `${template.slug}-preview.pdf`,
          )
        : null,
    };
  }

  async categories() {
    const rows = await this.templateRepository
      .createQueryBuilder('template')
      .select('template.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('template.status = :status', { status: ResumeTemplateStatus.PUBLISHED })
      .groupBy('template.category')
      .orderBy('template.category', 'ASC')
      .getRawMany<{ category: string; count: string }>();
    return rows.map((row) => ({ category: row.category, count: Number(row.count) }));
  }

  async getPublishedTemplate(templateId: string) {
    const template = await this.requireTemplate(templateId);
    if (template.status !== ResumeTemplateStatus.PUBLISHED || !template.publishedVersionId) {
      throw new NotFoundException('Published template was not found');
    }
    const version = await this.requirePublishedVersion(template);
    return { template, version };
  }

  getTemplateContract() {
    return {
      defaultFieldSchema: DEFAULT_RESUME_FIELD_SCHEMA,
      placeholderSyntax: {
        value: '{{personal.fullName}}',
        condition: '{{#if summary}}...{{/if}}',
        list: '{{#each experience}}...{{company}}...{{/each}}',
        parent: '{{../company}}',
        index: '{{@index}}',
      },
      markupConventions: {
        hideEmptySection: '<section data-resume-section="summary">...</section>',
        avoidEntrySplit: '<article data-resume-entry>...</article>',
        avoidOrphanHeading: '<h2 data-resume-section-title>Experience</h2>',
        cropPhoto: '<img data-resume-photo src="{{personal.photoUrl}}" />',
      },
      security: 'HTML/CSS only. JavaScript, event handlers, external imports, and hard-coded remote URLs are rejected.',
      aiAssist: { summary: 'POST /resume-studio/ai/summary-suggestions' },
      fieldInference: {
        endpoint: 'POST /admin/resume-studio/templates/infer-field-schema',
        behavior: 'Scans HTML placeholders and returns a Flutter-ready field schema while preserving editable labels, limits, order, and zones.',
      },
      publishedPreview: 'GET /resume-studio/templates/:id/preview',
      rendering: 'A4 PDF generated by backend Chromium. Admin preview and final user PDF use the same renderer.',
    };
  }

  private withDefaultPreviewPhoto(
    data: ResumeData,
    schema: ResumeTemplateFieldSchema,
  ): ResumeData {
    const photoEnabled = schema.sections.some(
      (section) =>
        section.key === 'personal' &&
        section.enabled &&
        !section.hidden &&
        (section.fields ?? []).some(
          (field) =>
            field.key === 'personal.photoFileId' &&
            field.enabled &&
            !field.hidden,
        ),
    );
    if (!photoEnabled || !RESUME_PREVIEW_SAMPLE.personal?.photoUrl) return data;
    return {
      ...data,
      personal: {
        ...(data.personal ?? {}),
        photoUrl: RESUME_PREVIEW_SAMPLE.personal.photoUrl,
      },
    };
  }

  private validateSource(input: {
    html: string;
    css: string;
    fieldSchema: Record<string, unknown>;
    rendererConfig: Record<string, unknown>;
  }): {
    html: string;
    css: string;
    fieldSchema: ResumeTemplateFieldSchema;
    rendererConfig: ResumeRendererConfig;
    checksum: string;
  } {
    this.securityService.validate(input.html, input.css);
    const fieldSchema = this.schemaService.validateTemplateSchema(input.fieldSchema);
    const rendererConfig = this.schemaService.validateRendererConfig(input.rendererConfig);
    const checksum = createHash('sha256')
      .update(JSON.stringify({ html: input.html, css: input.css, fieldSchema, rendererConfig }))
      .digest('hex');
    return { html: input.html, css: input.css, fieldSchema, rendererConfig, checksum };
  }

  private async requireTemplate(id: string): Promise<ResumeTemplate> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Resume template was not found');
    return template;
  }

  private async requirePublishedVersion(template: ResumeTemplate): Promise<ResumeTemplateVersion> {
    const version = template.publishedVersionId
      ? await this.versionRepository.findOne({ where: { id: template.publishedVersionId } })
      : null;
    if (!version || version.status !== ResumeTemplateVersionStatus.PUBLISHED) {
      throw new NotFoundException('Published template version was not found');
    }
    return version;
  }
}
