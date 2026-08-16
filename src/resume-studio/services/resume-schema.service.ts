import { BadRequestException, Injectable } from '@nestjs/common';
import { RESUME_LIMITS } from '../constants/resume-limits';
import { RESUME_ALLOWED_FIELD_KEYS } from '../constants/resume-field-catalog';
import type {
  ResumeData,
  ResumeEducationItem,
  ResumeExperienceItem,
  ResumeProjectItem,
} from '../types/resume-data.types';
import {
  RESUME_FIELD_TYPES,
  RESUME_SECTION_KEYS,
  RESUME_SIDEBAR_CONTINUATIONS,
  RESUME_TEMPLATE_LAYOUTS,
  type ResumeRendererConfig,
  type ResumeTemplateFieldSchema,
} from '../types/template-schema.types';

@Injectable()
export class ResumeSchemaService {
  validateTemplateSchema(
    input: Record<string, unknown>,
  ): ResumeTemplateFieldSchema {
    if (input.version !== 1 || !Array.isArray(input.sections)) {
      throw new BadRequestException(
        'Template fieldSchema must use version 1 with sections[]',
      );
    }

    const seenSections = new Set<string>();
    const sections = input.sections.map((rawSection, index) => {
      const section = this.asRecord(
        rawSection,
        `fieldSchema.sections[${index}]`,
      );
      const key = this.readString(
        section.key,
        `fieldSchema.sections[${index}].key`,
      );
      if (
        !RESUME_SECTION_KEYS.includes(
          key as (typeof RESUME_SECTION_KEYS)[number],
        )
      ) {
        throw new BadRequestException(`Unsupported resume section key: ${key}`);
      }
      if (seenSections.has(key)) {
        throw new BadRequestException(`Duplicate resume section key: ${key}`);
      }
      seenSections.add(key);

      const fields = Array.isArray(section.fields)
        ? section.fields.map((rawField, fieldIndex) => {
            const field = this.asRecord(
              rawField,
              `${key}.fields[${fieldIndex}]`,
            );
            const type = this.readString(
              field.type,
              `${key}.fields[${fieldIndex}].type`,
            );
            if (
              !RESUME_FIELD_TYPES.includes(
                type as (typeof RESUME_FIELD_TYPES)[number],
              )
            ) {
              throw new BadRequestException(`Unsupported field type: ${type}`);
            }
            const fieldKey = this.readString(
              field.key,
              `${key}.fields[${fieldIndex}].key`,
            );
            if (!RESUME_ALLOWED_FIELD_KEYS.has(fieldKey)) {
              throw new BadRequestException(
                `Unsupported CV field key: ${fieldKey}`,
              );
            }
            if (fieldKey !== key && !fieldKey.startsWith(`${key}.`)) {
              throw new BadRequestException(
                `CV field ${fieldKey} does not belong to section ${key}`,
              );
            }
            return {
              key: fieldKey,
              label: this.readString(
                field.label,
                `${key}.fields[${fieldIndex}].label`,
              ),
              type: type as any,
              enabled: this.readBoolean(field.enabled, true),
              required: this.readBoolean(field.required, false),
              hidden: this.readBoolean(field.hidden, false),
              maxLength: this.readOptionalPositiveInt(field.maxLength),
              maxItems: this.readOptionalPositiveInt(field.maxItems),
              options: Array.isArray(field.options)
                ? field.options
                    .filter(
                      (value): value is string => typeof value === 'string',
                    )
                    .slice(0, 50)
                : undefined,
              aiAssist: this.aiAssistForField(fieldKey),
            };
          })
        : undefined;

      const zone = typeof section.zone === 'string' ? section.zone : undefined;
      if (zone && !['header', 'main', 'sidebar', 'footer'].includes(zone)) {
        throw new BadRequestException(`Unsupported section zone: ${zone}`);
      }

      return {
        key: key as any,
        label: this.readString(section.label, `${key}.label`),
        enabled: this.readBoolean(section.enabled, true),
        required: this.readBoolean(section.required, false),
        hidden: this.readBoolean(section.hidden, false),
        order: this.readInteger(section.order, index * 10),
        zone: zone as any,
        maxItems: this.readOptionalPositiveInt(section.maxItems),
        fields,
      };
    });

    return { version: 1, sections };
  }

  validateRendererConfig(input: Record<string, unknown>): ResumeRendererConfig {
    const layout = this.readString(input.layout, 'rendererConfig.layout');
    if (!RESUME_TEMPLATE_LAYOUTS.includes(layout as any)) {
      throw new BadRequestException(`Unsupported template layout: ${layout}`);
    }

    const sidebarContinuation = this.readString(
      input.sidebarContinuation ?? 'not-applicable',
      'rendererConfig.sidebarContinuation',
    );
    if (!RESUME_SIDEBAR_CONTINUATIONS.includes(sidebarContinuation as any)) {
      throw new BadRequestException(
        `Unsupported sidebar continuation: ${sidebarContinuation}`,
      );
    }
    if (layout === 'two-column' && sidebarContinuation !== 'template-managed') {
      throw new BadRequestException(
        'Two-column templates must explicitly use sidebarContinuation="template-managed"',
      );
    }

    const recommendedMaxPages = this.readPositiveInt(
      input.recommendedMaxPages,
      RESUME_LIMITS.recommendedPages,
    );
    const hardMaxPages = this.readPositiveInt(
      input.hardMaxPages,
      RESUME_LIMITS.hardMaxPages,
    );
    if (hardMaxPages > RESUME_LIMITS.hardMaxPages) {
      throw new BadRequestException(
        `hardMaxPages cannot exceed ${RESUME_LIMITS.hardMaxPages}`,
      );
    }
    if (recommendedMaxPages > hardMaxPages) {
      throw new BadRequestException(
        'recommendedMaxPages cannot exceed hardMaxPages',
      );
    }

    return {
      layout: layout as any,
      sidebarContinuation: sidebarContinuation as any,
      recommendedMaxPages,
      hardMaxPages,
      locale:
        typeof input.locale === 'string' && input.locale.trim()
          ? input.locale.trim().slice(0, 20)
          : 'en',
    };
  }

  normalizeResumeData(
    input: Record<string, unknown>,
    fieldSchema?: ResumeTemplateFieldSchema,
  ): ResumeData {
    const personalRaw = this.optionalRecord(input.personal);
    const personal = personalRaw
      ? {
          fullName: this.cleanText(
            personalRaw.fullName,
            RESUME_LIMITS.fullName,
          ),
          jobTitle: this.cleanText(
            personalRaw.jobTitle,
            RESUME_LIMITS.jobTitle,
          ),
          email: this.cleanText(personalRaw.email, RESUME_LIMITS.email),
          phone: this.cleanText(personalRaw.phone, RESUME_LIMITS.phone),
          location: this.cleanText(
            personalRaw.location,
            RESUME_LIMITS.location,
          ),
          website: this.cleanUrl(personalRaw.website),
          linkedin: this.cleanUrl(personalRaw.linkedin),
          github: this.cleanUrl(personalRaw.github),
          photoFileId: this.cleanUuidLike(personalRaw.photoFileId),
          drivingLicense: this.normalizeStringArray(
            personalRaw.drivingLicense,
            RESUME_LIMITS.drivingLicenseItems,
            40,
          ),
        }
      : undefined;

    const normalized: ResumeData = {
      personal,
      summary: this.cleanMultiline(input.summary, RESUME_LIMITS.summary),
      experience: this.normalizeExperiences(input.experience),
      education: this.normalizeEducation(input.education),
      skills: this.normalizeStringArray(
        input.skills,
        RESUME_LIMITS.skillItems,
        RESUME_LIMITS.shortText,
      ),
      projects: this.normalizeProjects(input.projects),
      languages: this.normalizeObjectArray(
        input.languages,
        RESUME_LIMITS.languageItems,
        (item) => ({
          id: this.cleanText(item.id, 80),
          name: this.cleanText(item.name, RESUME_LIMITS.shortText),
          proficiency: this.cleanText(item.proficiency, 80),
        }),
      ),
      certifications: this.normalizeObjectArray(
        input.certifications,
        RESUME_LIMITS.certificationItems,
        (item) => ({
          id: this.cleanText(item.id, 80),
          name: this.cleanText(item.name, RESUME_LIMITS.shortText),
          issuer: this.cleanText(item.issuer, RESUME_LIMITS.shortText),
          issueDate: this.normalizeDate(item.issueDate),
          expiryDate:
            item.doesNotExpire === true
              ? undefined
              : this.normalizeDate(item.expiryDate),
          doesNotExpire: item.doesNotExpire === true,
          credentialId: this.cleanText(item.credentialId, 160),
          credentialUrl: this.cleanUrl(item.credentialUrl),
        }),
      ),
      references: this.normalizeObjectArray(
        input.references,
        RESUME_LIMITS.referenceItems,
        (item) => ({
          id: this.cleanText(item.id, 80),
          name: this.cleanText(item.name, RESUME_LIMITS.shortText),
          title: this.cleanText(item.title, RESUME_LIMITS.shortText),
          company: this.cleanText(item.company, RESUME_LIMITS.shortText),
          email: this.cleanText(item.email, RESUME_LIMITS.email),
          phone: this.cleanText(item.phone, RESUME_LIMITS.phone),
        }),
      ),
    };

    this.validateTemplateConstraints(normalized, fieldSchema);
    return this.removeEmptyValues(normalized) as ResumeData;
  }

  getEmptySections(data: ResumeData): string[] {
    return RESUME_SECTION_KEYS.filter((key) =>
      this.isEmpty((data as any)[key]),
    );
  }

  applyTemplateVisibility(
    data: ResumeData,
    schema: ResumeTemplateFieldSchema,
  ): ResumeData {
    const output = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
    for (const section of schema.sections) {
      if (!section.enabled || section.hidden) {
        delete output[section.key];
        continue;
      }
      for (const field of section.fields ?? []) {
        if (field.enabled && !field.hidden) continue;
        this.deleteFieldPath(output, section.key, field.key);
      }
    }
    return this.removeEmptyValues(output) as ResumeData;
  }

  private aiAssistForField(fieldKey: string) {
    if (fieldKey === 'summary') return 'summary-suggestions' as const;
    if (fieldKey === 'skills') return 'technical-skill-suggestions' as const;
    if (
      fieldKey === 'experience.description' ||
      fieldKey === 'projects.description'
    ) {
      return 'description-suggestions' as const;
    }
    if (
      fieldKey === 'experience.bullets' ||
      fieldKey === 'projects.bullets'
    ) {
      return 'highlight-suggestions' as const;
    }
    return undefined;
  }

  private normalizeExperiences(
    value: unknown,
  ): ResumeExperienceItem[] | undefined {
    return this.normalizeObjectArray(
      value,
      RESUME_LIMITS.experienceItems,
      (item) => ({
        id: this.cleanText(item.id, 80),
        company: this.cleanText(item.company, RESUME_LIMITS.shortText),
        position: this.cleanText(item.position, RESUME_LIMITS.shortText),
        employmentType: this.cleanText(item.employmentType, 80),
        location: this.cleanText(item.location, RESUME_LIMITS.location),
        startDate: this.normalizeDate(item.startDate),
        // Keep the stored value schema-safe. `Present` is a presentation concern:
        // templates render it from `isCurrent`, while Flutter hides the end-date
        // input for current roles. This also prevents `present — Present`.
        endDate:
          item.isCurrent === true
            ? undefined
            : this.normalizeDate(item.endDate),
        isCurrent: item.isCurrent === true,
        description: this.cleanMultiline(
          item.description,
          RESUME_LIMITS.description,
        ),
        bullets: this.normalizeStringArray(
          item.bullets,
          RESUME_LIMITS.bulletsPerItem,
          RESUME_LIMITS.bullet,
        ),
      }),
    );
  }

  private normalizeEducation(
    value: unknown,
  ): ResumeEducationItem[] | undefined {
    return this.normalizeObjectArray(
      value,
      RESUME_LIMITS.educationItems,
      (item) => ({
        id: this.cleanText(item.id, 80),
        institution: this.cleanText(item.institution, RESUME_LIMITS.shortText),
        degree: this.cleanText(item.degree, RESUME_LIMITS.shortText),
        fieldOfStudy: this.cleanText(
          item.fieldOfStudy,
          RESUME_LIMITS.shortText,
        ),
        cgpa: this.cleanText(item.cgpa, 40),
        location: this.cleanText(item.location, RESUME_LIMITS.location),
        startDate: this.normalizeDate(item.startDate),
        endDate:
          item.isCurrent === true
            ? undefined
            : this.normalizeDate(item.endDate),
        isCurrent: item.isCurrent === true,
        achievements: this.normalizeStringArray(
          item.achievements,
          RESUME_LIMITS.bulletsPerItem,
          RESUME_LIMITS.bullet,
        ),
        description: this.cleanMultiline(
          item.description,
          RESUME_LIMITS.description,
        ),
      }),
    );
  }

  private normalizeProjects(value: unknown): ResumeProjectItem[] | undefined {
    return this.normalizeObjectArray(
      value,
      RESUME_LIMITS.projectItems,
      (item) => ({
        id: this.cleanText(item.id, 80),
        name: this.cleanText(item.name, RESUME_LIMITS.shortText),
        role: this.cleanText(item.role, RESUME_LIMITS.shortText),
        url: this.cleanUrl(item.url),
        startDate: this.normalizeDate(item.startDate),
        endDate:
          item.isCurrent === true
            ? undefined
            : this.normalizeDate(item.endDate),
        isCurrent: item.isCurrent === true,
        description: this.cleanMultiline(
          item.description,
          RESUME_LIMITS.description,
        ),
        bullets: this.normalizeStringArray(
          item.bullets,
          RESUME_LIMITS.bulletsPerItem,
          RESUME_LIMITS.bullet,
        ),
        technologies: this.normalizeStringArray(
          item.technologies,
          30,
          RESUME_LIMITS.shortText,
        ),
      }),
    );
  }

  private normalizeObjectArray<T>(
    value: unknown,
    maxItems: number,
    mapper: (item: Record<string, unknown>) => T,
  ): T[] | undefined {
    if (value == null) return undefined;
    if (!Array.isArray(value)) throw new BadRequestException('Expected a list');
    if (value.length > maxItems) {
      throw new BadRequestException(
        `Too many entries. Maximum allowed is ${maxItems}`,
      );
    }
    const result = value.map((item, index) =>
      mapper(this.asRecord(item, `item[${index}]`)),
    );
    return result.length ? result : undefined;
  }

  private normalizeStringArray(
    value: unknown,
    maxItems: number,
    maxLength: number,
  ): string[] | undefined {
    if (value == null) return undefined;
    if (!Array.isArray(value)) throw new BadRequestException('Expected a list');
    if (value.length > maxItems) {
      throw new BadRequestException(
        `Too many entries. Maximum allowed is ${maxItems}`,
      );
    }
    const result = value
      .map((item) => this.cleanText(item, maxLength))
      .filter((item): item is string => Boolean(item));
    return result.length ? result : undefined;
  }

  private validateTemplateConstraints(
    data: ResumeData,
    schema?: ResumeTemplateFieldSchema,
  ) {
    if (!schema) return;
    for (const section of schema.sections) {
      if (!section.enabled) continue;
      const sectionValue = (data as any)[section.key];
      if (section.required && this.isEmpty(sectionValue)) {
        throw new BadRequestException(
          `Required CV section is missing: ${section.key}`,
        );
      }
      if (
        section.maxItems &&
        Array.isArray(sectionValue) &&
        sectionValue.length > section.maxItems
      ) {
        throw new BadRequestException(
          `Template allows at most ${section.maxItems} items in ${section.key}`,
        );
      }

      for (const field of section.fields ?? []) {
        if (!field.enabled) continue;
        const relativeKey = field.key.startsWith(`${section.key}.`)
          ? field.key.slice(section.key.length + 1)
          : field.key;

        if (Array.isArray(sectionValue) && relativeKey !== field.key) {
          for (let index = 0; index < sectionValue.length; index += 1) {
            const value = this.readNested(sectionValue[index], relativeKey);
            if (field.required && this.isEmpty(value)) {
              throw new BadRequestException(
                `Required CV field is missing: ${field.key} at item ${index + 1}`,
              );
            }
            if (
              field.maxItems &&
              Array.isArray(value) &&
              value.length > field.maxItems
            ) {
              throw new BadRequestException(
                `Template allows at most ${field.maxItems} values for ${field.key}`,
              );
            }
            this.assertFieldMaxLength(field.key, value, field.maxLength);
            this.assertFieldOptions(field.key, value, field.options);
          }
        } else {
          const value = this.readNested(data, field.key);
          if (field.required && this.isEmpty(value)) {
            throw new BadRequestException(
              `Required CV field is missing: ${field.key}`,
            );
          }
          if (
            field.maxItems &&
            Array.isArray(value) &&
            value.length > field.maxItems
          ) {
            throw new BadRequestException(
              `Template allows at most ${field.maxItems} values for ${field.key}`,
            );
          }
          this.assertFieldMaxLength(field.key, value, field.maxLength);
          this.assertFieldOptions(field.key, value, field.options);
        }
      }
    }
  }

  private readNested(value: unknown, path: string): unknown {
    if (!path) return value;
    return path.split('.').reduce<unknown>((current, key) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[key];
    }, value);
  }

  private deleteFieldPath(
    root: Record<string, unknown>,
    sectionKey: string,
    fieldKey: string,
  ) {
    if (fieldKey === sectionKey) {
      delete root[sectionKey];
      return;
    }
    const relative = fieldKey.startsWith(`${sectionKey}.`)
      ? fieldKey.slice(sectionKey.length + 1)
      : fieldKey;
    const sectionValue = root[sectionKey];
    if (Array.isArray(sectionValue)) {
      for (const item of sectionValue) {
        if (item && typeof item === 'object') {
          delete (item as Record<string, unknown>)[relative];
        }
      }
      return;
    }
    if (sectionValue && typeof sectionValue === 'object') {
      delete (sectionValue as Record<string, unknown>)[relative];
    }
  }

  private assertFieldOptions(
    fieldKey: string,
    value: unknown,
    options?: string[],
  ) {
    if (!options?.length || value == null) return;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (typeof item === 'string' && !options.includes(item)) {
        throw new BadRequestException(
          `Template field ${fieldKey} must be one of: ${options.join(', ')}`,
        );
      }
    }
  }

  private assertFieldMaxLength(
    fieldKey: string,
    value: unknown,
    maxLength?: number,
  ) {
    if (!maxLength || value == null) return;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (typeof item === 'string' && item.length > maxLength) {
        throw new BadRequestException(
          `Template field ${fieldKey} exceeds its maximum length of ${maxLength}`,
        );
      }
    }
  }

  private normalizeDate(value: unknown): string | undefined {
    const raw = this.cleanText(value, 40);
    if (!raw) return undefined;
    if (/^(present|current|ongoing)$/i.test(raw)) return 'present';
    if (/^\d{4}$/.test(raw)) return raw;
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
    const slash = raw.match(/^(0?[1-9]|1[0-2])\/(\d{4})$/);
    if (slash) return `${slash[2]}-${slash[1].padStart(2, '0')}`;

    const monthNames: Record<string, string> = {
      jan: '01',
      january: '01',
      feb: '02',
      february: '02',
      mar: '03',
      march: '03',
      apr: '04',
      april: '04',
      may: '05',
      jun: '06',
      june: '06',
      jul: '07',
      july: '07',
      aug: '08',
      august: '08',
      sep: '09',
      sept: '09',
      september: '09',
      oct: '10',
      october: '10',
      nov: '11',
      november: '11',
      dec: '12',
      december: '12',
    };
    const named = raw.toLowerCase().match(/^([a-z]+)\s+(\d{4})$/);
    if (named && monthNames[named[1]])
      return `${named[2]}-${monthNames[named[1]]}`;
    throw new BadRequestException(`Unsupported date format: ${raw}`);
  }

  private cleanUrl(value: unknown): string | undefined {
    const text = this.cleanText(value, RESUME_LIMITS.url);
    if (!text) return undefined;
    try {
      const parsed = new URL(
        text.startsWith('http://') || text.startsWith('https://')
          ? text
          : `https://${text}`,
      );
      if (!['http:', 'https:'].includes(parsed.protocol))
        throw new Error('invalid protocol');
      return parsed.toString();
    } catch {
      throw new BadRequestException(`Invalid URL: ${text}`);
    }
  }

  private cleanUuidLike(value: unknown): string | undefined {
    const text = this.cleanText(value, 80);
    if (!text) return undefined;
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(text)) {
      throw new BadRequestException('Invalid photoFileId');
    }
    return text;
  }

  private cleanText(value: unknown, maxLength: number): string | undefined {
    if (value == null) return undefined;
    if (typeof value !== 'string')
      throw new BadRequestException('Expected text value');
    const normalized = value
      .replace(/\u0000/g, '')
      .replace(/[ \t]+/g, ' ')
      .trim();
    if (!normalized) return undefined;
    if (normalized.length > maxLength) {
      throw new BadRequestException(
        `Text exceeds maximum length of ${maxLength}`,
      );
    }
    return normalized;
  }

  private cleanMultiline(
    value: unknown,
    maxLength: number,
  ): string | undefined {
    if (value == null) return undefined;
    if (typeof value !== 'string')
      throw new BadRequestException('Expected text value');
    const normalized = value
      .replace(/\u0000/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!normalized) return undefined;
    if (normalized.length > maxLength) {
      throw new BadRequestException(
        `Text exceeds maximum length of ${maxLength}`,
      );
    }
    return normalized;
  }

  private removeEmptyValues(value: unknown): unknown {
    if (Array.isArray(value)) {
      const items = value
        .map((item) => this.removeEmptyValues(item))
        .filter((item) => !this.isEmpty(item));
      return items.length ? items : undefined;
    }
    if (value && typeof value === 'object') {
      const output: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(
        value as Record<string, unknown>,
      )) {
        const cleaned = this.removeEmptyValues(item);
        if (!this.isEmpty(cleaned)) output[key] = cleaned;
      }
      return Object.keys(output).length ? output : undefined;
    }
    return value;
  }

  private isEmpty(value: unknown): boolean {
    if (value == null || value === '') return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object')
      return Object.keys(value as object).length === 0;
    return false;
  }

  private asRecord(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`${path} must be an object`);
    }
    return value as Record<string, unknown>;
  }

  private optionalRecord(value: unknown): Record<string, unknown> | undefined {
    if (value == null) return undefined;
    return this.asRecord(value, 'personal');
  }

  private readString(value: unknown, path: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${path} must be a non-empty string`);
    }
    return value.trim();
  }

  private readBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
  }

  private readInteger(value: unknown, fallback: number): number {
    return Number.isInteger(value) ? Number(value) : fallback;
  }

  private readOptionalPositiveInt(value: unknown): number | undefined {
    if (value == null) return undefined;
    if (!Number.isInteger(value) || Number(value) <= 0) {
      throw new BadRequestException('Expected a positive integer');
    }
    return Number(value);
  }

  private readPositiveInt(value: unknown, fallback: number): number {
    return value == null ? fallback : this.readOptionalPositiveInt(value)!;
  }
}
