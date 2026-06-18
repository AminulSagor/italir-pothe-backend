import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';

import { CreateCvDocumentDto } from '../dto/cv-document.dto';
import {
  CreateCvTemplateDto,
  CvTemplateListQueryDto,
  PaginationQueryDto,
  SaveCvDefaultLayoutDto,
  UpdateCvTemplateDto,
} from '../dto/cv-template.dto';
import { CvDocument, CvDocumentStatus } from '../entities/cv-document.entity';
import { CvTemplateDefaultLayout } from '../entities/cv-template-default-layout.entity';
import {
  CvTemplate,
  CvTemplatePageSize,
  CvTemplateStatus,
  CvTemplateStyleType,
} from '../entities/cv-template.entity';

type PaginationMeta = {
  page: number;
  limit: number;
  totalPages: number;
  totalItems: number;
};

@Injectable()
export class CvBuilderService {
  constructor(
    @InjectRepository(CvTemplate)
    private readonly cvTemplateRepository: Repository<CvTemplate>,

    @InjectRepository(CvDocument)
    private readonly cvDocumentRepository: Repository<CvDocument>,

    @InjectRepository(CvTemplateDefaultLayout)
    private readonly cvTemplateDefaultLayoutRepository: Repository<CvTemplateDefaultLayout>,
  ) {}

  async createTemplate(dto: CreateCvTemplateDto, adminId: string) {
    const template = this.cvTemplateRepository.create({
      title: dto.title.trim(),
      description: this.normalizeNullableString(dto.description),
      styleType: dto.styleType ?? CvTemplateStyleType.ATS,
      pageSize: dto.pageSize ?? CvTemplatePageSize.A4,
      fontFamily: dto.fontFamily?.trim() || 'Inter',
      primaryColor: dto.primaryColor ?? '#006B3F',
      accentColor: dto.accentColor ?? '#E6F6F0',
      isPremium: dto.isPremium ?? false,
      status: dto.status ?? CvTemplateStatus.DRAFT,
      previewImageUrl: this.normalizeNullableString(dto.previewImageUrl),
      schema: this.normalizeSchema(dto.schema),
      createdByAdminId: adminId,
    });

    const savedTemplate = await this.cvTemplateRepository.save(template);

    return {
      message: 'CV template created successfully.',
      template: this.mapTemplateResponse(savedTemplate),
    };
  }

  async updateTemplate(id: string, dto: UpdateCvTemplateDto) {
    const template = await this.findTemplateEntityById(id);

    if (dto.title !== undefined) template.title = dto.title.trim();
    if (dto.description !== undefined) {
      template.description = this.normalizeNullableString(dto.description);
    }
    if (dto.styleType !== undefined) template.styleType = dto.styleType;
    if (dto.pageSize !== undefined) template.pageSize = dto.pageSize;
    if (dto.fontFamily !== undefined) {
      template.fontFamily = dto.fontFamily.trim() || 'Inter';
    }
    if (dto.primaryColor !== undefined) template.primaryColor = dto.primaryColor;
    if (dto.accentColor !== undefined) template.accentColor = dto.accentColor;
    if (dto.isPremium !== undefined) template.isPremium = dto.isPremium;
    if (dto.status !== undefined) template.status = dto.status;
    if (dto.previewImageUrl !== undefined) {
      template.previewImageUrl = this.normalizeNullableString(
        dto.previewImageUrl,
      );
    }
    if (dto.schema !== undefined) template.schema = this.normalizeSchema(dto.schema);

    const savedTemplate = await this.cvTemplateRepository.save(template);

    return {
      message: 'CV template updated successfully.',
      template: this.mapTemplateResponse(savedTemplate),
    };
  }

  async deleteTemplate(id: string) {
    const template = await this.findTemplateEntityById(id);
    await this.cvTemplateRepository.remove(template);

    return {
      message: 'CV template deleted successfully.',
      templateId: id,
    };
  }

  async updateTemplateStatus(id: string, status: CvTemplateStatus) {
    const template = await this.findTemplateEntityById(id);
    template.status = status;

    const savedTemplate = await this.cvTemplateRepository.save(template);

    return {
      message: 'CV template status updated successfully.',
      template: this.mapTemplateResponse(savedTemplate),
    };
  }

  async getAdminTemplates(query: CvTemplateListQueryDto) {
    return this.getTemplatesList(query, false);
  }

  async getActiveTemplates(query: CvTemplateListQueryDto) {
    return this.getTemplatesList(query, true);
  }

  async getDefaultLayout(styleType: CvTemplateStyleType) {
    const defaultLayout = await this.cvTemplateDefaultLayoutRepository.findOne({
      where: { styleType },
    });

    return {
      layout: defaultLayout ? this.mapDefaultLayoutResponse(defaultLayout) : null,
    };
  }

  async saveDefaultLayout(
    styleType: CvTemplateStyleType,
    dto: SaveCvDefaultLayoutDto,
    adminId: string,
  ) {
    const existingLayout = await this.cvTemplateDefaultLayoutRepository.findOne({
      where: { styleType },
    });

    const defaultLayout = existingLayout ??
      this.cvTemplateDefaultLayoutRepository.create({
        styleType,
        updatedByAdminId: adminId,
      });

    defaultLayout.pageSize = dto.pageSize ?? defaultLayout.pageSize ?? CvTemplatePageSize.A4;
    defaultLayout.fontFamily = dto.fontFamily?.trim() || defaultLayout.fontFamily || 'Inter';
    defaultLayout.primaryColor = dto.primaryColor ?? defaultLayout.primaryColor ?? '#183847';
    defaultLayout.accentColor = dto.accentColor ?? defaultLayout.accentColor ?? '#F3F4F6';
    defaultLayout.schema = this.normalizeSchema(dto.schema);
    defaultLayout.updatedByAdminId = adminId;

    const savedLayout = await this.cvTemplateDefaultLayoutRepository.save(defaultLayout);

    return {
      message: 'CV default layout saved successfully.',
      layout: this.mapDefaultLayoutResponse(savedLayout),
    };
  }

  async getTemplateById(id: string, activeOnly = false) {
    const template = await this.cvTemplateRepository.findOne({
      where: activeOnly
        ? {
            id,
            status: CvTemplateStatus.ACTIVE,
          }
        : { id },
    });

    if (!template) throw new NotFoundException('CV template not found');

    return {
      template: this.mapTemplateResponse(template),
    };
  }

  async createDocument(dto: CreateCvDocumentDto, userId: string) {
    const template = await this.cvTemplateRepository.findOne({
      where: {
        id: dto.templateId,
        status: CvTemplateStatus.ACTIVE,
      },
    });

    if (!template) throw new NotFoundException('Active CV template not found');

    const document = this.cvDocumentRepository.create({
      userId,
      templateId: dto.templateId,
      title: dto.title.trim(),
      themeColor: dto.themeColor ?? template.primaryColor,
      accentColor: dto.accentColor ?? template.accentColor,
      formData: this.normalizeDocumentFormData(template, dto.formData),
      templateSnapshot: this.mapTemplateResponse(template),
      status: CvDocumentStatus.READY,
    });

    const savedDocument = await this.cvDocumentRepository.save(document);

    return {
      message: 'CV saved successfully.',
      document: this.mapDocumentResponse(savedDocument, template),
    };
  }

  async getMyDocuments(userId: string, query: PaginationQueryDto) {
    const pagination = this.normalizePagination(query);

    const [documents, totalItems] = await this.cvDocumentRepository.findAndCount({
      where: {
        userId,
      },
      relations: ['template'],
      order: {
        updatedAt: 'DESC',
      },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    });

    return {
      documents: documents.map((document) =>
        this.mapDocumentResponse(document, document.template),
      ),
      pagination: this.buildPaginationMeta(totalItems, pagination),
    };
  }

  private async getTemplatesList(
    query: CvTemplateListQueryDto,
    activeOnly: boolean,
  ) {
    const pagination = this.normalizePagination(query);
    const baseWhere: FindOptionsWhere<CvTemplate> = {};

    if (activeOnly) baseWhere.status = CvTemplateStatus.ACTIVE;
    if (query.styleType && query.styleType !== 'all') {
      baseWhere.styleType = query.styleType as CvTemplateStyleType;
    }

    const search = query.search?.trim();
    const where: FindOptionsWhere<CvTemplate> = search
      ? { ...baseWhere, title: ILike(`%${search}%`) }
      : baseWhere;

    const [templates, totalItems] = await this.cvTemplateRepository.findAndCount({
      where,
      order: {
        createdAt: 'DESC',
      },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    });

    return {
      templates: templates.map((template) => this.mapTemplateResponse(template)),
      pagination: this.buildPaginationMeta(totalItems, pagination),
    };
  }

  private async findTemplateEntityById(id: string): Promise<CvTemplate> {
    const template = await this.cvTemplateRepository.findOne({ where: { id } });

    if (!template) throw new NotFoundException('CV template not found');

    return template;
  }

  private mapTemplateResponse(template: CvTemplate) {
    return {
      id: template.id,
      title: template.title,
      description: template.description,
      styleType: template.styleType,
      pageSize: template.pageSize,
      fontFamily: template.fontFamily,
      primaryColor: template.primaryColor,
      accentColor: template.accentColor,
      isPremium: template.isPremium,
      status: template.status,
      previewImageUrl: template.previewImageUrl,
      schema: template.schema,
      createdByAdminId: template.createdByAdminId,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  private mapDefaultLayoutResponse(defaultLayout: CvTemplateDefaultLayout) {
    return {
      id: defaultLayout.id,
      styleType: defaultLayout.styleType,
      pageSize: defaultLayout.pageSize,
      fontFamily: defaultLayout.fontFamily,
      primaryColor: defaultLayout.primaryColor,
      accentColor: defaultLayout.accentColor,
      schema: defaultLayout.schema,
      updatedByAdminId: defaultLayout.updatedByAdminId,
      createdAt: defaultLayout.createdAt,
      updatedAt: defaultLayout.updatedAt,
    };
  }

  private mapDocumentResponse(document: CvDocument, template?: CvTemplate | null) {
    const templateResponse = this.resolveDocumentTemplateResponse(
      document,
      template,
    );

    return {
      id: document.id,
      templateId: document.templateId,
      templateTitle:
        this.toNonEmptyString(templateResponse?.['title']) ??
        template?.title ??
        null,
      title: document.title,
      themeColor: document.themeColor,
      accentColor: document.accentColor,
      formData: document.formData,
      status: document.status,
      template: templateResponse,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  private resolveDocumentTemplateResponse(
    document: CvDocument,
    template?: CvTemplate | null,
  ) {
    const templateSnapshot = this.asRecord(document.templateSnapshot);
    if (templateSnapshot) return templateSnapshot;
    return template ? this.mapTemplateResponse(template) : null;
  }

  private normalizeDocumentFormData(
    template: CvTemplate,
    formData: Record<string, unknown>,
  ): Record<string, unknown> {
    const schema = this.asRecord(template.schema);
    const rawSections = schema && Array.isArray(schema.sections) ? schema.sections : [];
    const normalizedData: Record<string, unknown> = {};

    for (const rawSection of rawSections) {
      const section = this.asRecord(rawSection);
      if (!section) continue;

      const sectionKey = this.toNonEmptyString(section.key);
      if (!sectionKey) continue;

      const rawSectionData = this.asRecord(formData[sectionKey]);
      if (!rawSectionData) continue;

      const fields = Array.isArray(section.fields) ? section.fields : [];
      const sectionData: Record<string, unknown> = {};

      for (const rawField of fields) {
        const field = this.asRecord(rawField);
        if (!field) continue;

        const fieldKey = this.toNonEmptyString(field.key);
        if (!fieldKey) continue;

        const rawValue = rawSectionData[fieldKey];
        const normalizedValue = this.normalizeFieldValue(
          rawValue,
          this.toNonEmptyString(field.type) ?? 'text',
        );

        if (normalizedValue !== undefined) {
          sectionData[fieldKey] = normalizedValue;
        }
      }

      if (Object.keys(sectionData).length > 0) {
        normalizedData[sectionKey] = sectionData;
      }
    }

    return normalizedData;
  }

  private normalizeFieldValue(value: unknown, fieldType: string): unknown {
    if (value === null || value === undefined) return undefined;

    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (!trimmedValue) return undefined;

      if (fieldType.toLowerCase() === 'list') {
        return trimmedValue
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean);
      }

      return trimmedValue;
    }

    if (Array.isArray(value)) {
      if (fieldType.toLowerCase() === 'dynamicitems' || fieldType.toLowerCase() === 'dynamic_items') {
        const normalizedItems = value
          .map((item) => this.asRecord(item))
          .filter((item): item is Record<string, unknown> => Boolean(item))
          .map((item) => {
            const normalizedItem: Record<string, unknown> = {};
            for (const [key, itemValue] of Object.entries(item)) {
              const normalizedValue =
                typeof itemValue === 'string' ? itemValue.trim() : itemValue;
              if (
                normalizedValue !== null &&
                normalizedValue !== undefined &&
                normalizedValue !== ''
              ) {
                normalizedItem[key] = normalizedValue;
              }
            }
            return normalizedItem;
          })
          .filter((item) => Object.keys(item).length > 0);

        return normalizedItems.length > 0 ? normalizedItems : undefined;
      }

      const normalizedItems = value
        .map((item) => (typeof item === 'string' ? item.trim() : item))
        .filter((item) => item !== null && item !== undefined && item !== '');

      return normalizedItems.length > 0 ? normalizedItems : undefined;
    }

    return value;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return null;
  }

  private toNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') return null;

    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
  }

  private normalizeNullableString(value?: string | null): string | null {
    const normalizedValue = value?.trim();
    return normalizedValue && normalizedValue.length > 0 ? normalizedValue : null;
  }

  private normalizeSchema(schema?: Record<string, unknown>) {
    return schema && Object.keys(schema).length > 0
      ? schema
      : this.getDefaultTemplateSchema();
  }

  private normalizePagination(query: PaginationQueryDto) {
    return {
      page: query.page ?? 1,
      limit: query.limit ?? 10,
    };
  }

  private buildPaginationMeta(
    totalItems: number,
    pagination: { page: number; limit: number },
  ): PaginationMeta {
    return {
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(totalItems / pagination.limit),
      totalItems,
    };
  }

  private getDefaultTemplateSchema() {
    const designJson = {
      version: 2,
      format: 'cv_visual_template_json',
      page: {
        size: 'a4',
        width: 794,
        height: 1123,
        unit: 'px',
        margin: 40,
        backgroundColor: '#FFFFFF',
      },
      contentFlow: {
        mode: 'auto_paginated_sections',
        autoCreatePages: true,
        pageBreakStrategy: 'section_boundary',
        overflowBehavior: 'move_to_next_page',
        sectionGap: 16,
        collapseEmptySections: true,
        reflowAfterCollapse: true,
        growDynamicSections: true,
      },
      elements: [
        {
          id: 'sidebar',
          type: 'rectangle',
          fieldKey: 'custom',
          label: 'Left Column Background',
          placeholder: '',
          x: 0,
          y: 0,
          width: 250,
          height: 1123,
          zIndex: 1,
          style: { backgroundColor: '#183847', borderRadius: 0 },
        },
        {
          id: 'name',
          type: 'text',
          fieldKey: 'fullName',
          label: 'Full Name Text',
          placeholder: 'Your Name',
          x: 290,
          y: 70,
          width: 360,
          height: 44,
          zIndex: 3,
          contentBinding: {
            sectionKey: 'contact',
            fieldKey: 'fullName',
            mode: 'dynamic',
            autoHeight: true,
            allowPageBreak: false,
            collapseWhenEmpty: true,
            reflowSiblings: true,
          },
          style: {
            fontFamily: 'Inter',
            fontSize: 28,
            fontWeight: 800,
            color: '#183847',
          },
        },
        {
          id: 'divider',
          type: 'horizontalLine',
          fieldKey: 'custom',
          label: 'Divider',
          placeholder: '',
          x: 290,
          y: 160,
          width: 420,
          height: 2,
          zIndex: 2,
          style: { backgroundColor: '#183847', borderColor: '#183847', borderWidth: 2 },
        },
      ],
    };

    return {
      sections: [
        {
          key: 'contact',
          title: 'Personal Details',
          required: false,
          fields: [
            { key: 'fullName', label: 'Full name', type: 'text', required: false },
            { key: 'professionalTitle', label: 'Professional title', type: 'text', required: false },
            { key: 'email', label: 'Email', type: 'email', required: false },
            { key: 'phone', label: 'Phone', type: 'phone', required: false },
            { key: 'location', label: 'Location', type: 'text', required: false },
            { key: 'profilePhoto', label: 'Profile photo', type: 'photoUrl', required: false },
          ],
        },
        {
          key: 'summary',
          title: 'Summary',
          required: false,
          fields: [
            { key: 'summary', label: 'Summary', type: 'textarea', required: false },
          ],
        },
        {
          key: 'experience',
          title: 'Professional Experience',
          required: false,
          fields: [
            { key: 'experience', label: 'Experience items', type: 'list', required: false },
          ],
        },
      ],
      colorOptions: ['#006B3F', '#183847', '#646C7A', '#0B4A7D', '#7B4A2F'],
      designJson,
      layout: designJson,
    };
  }
}