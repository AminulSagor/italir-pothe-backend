import { Injectable } from '@nestjs/common';
import {
  RESUME_ALLOWED_FIELD_KEYS,
  DEFAULT_RESUME_FIELD_SCHEMA,
} from '../constants/resume-field-catalog';
import {
  RESUME_SECTION_KEYS,
  type ResumeSectionKey,
  type ResumeTemplateFieldSchema,
} from '../types/template-schema.types';

export interface ResumeTemplateFieldInferenceResult {
  fieldSchema: ResumeTemplateFieldSchema;
  detectedSectionKeys: ResumeSectionKey[];
  detectedFieldKeys: string[];
  ignoredPlaceholders: string[];
}

const TEMPLATE_TOKEN_PATTERN = /{{\s*([^{}]+?)\s*}}/g;
const SECTION_MARKUP_PATTERN = /data-resume-section\s*=\s*["']([^"']+)["']/gi;
const PHOTO_MARKUP_PATTERN = /\bdata-resume-photo\b/i;

@Injectable()
export class ResumeTemplateFieldInferenceService {
  infer(
    html: string,
    currentSchema?: ResumeTemplateFieldSchema,
  ): ResumeTemplateFieldInferenceResult {
    const detectedSections = new Set<ResumeSectionKey>();
    const detectedFields = new Set<string>();
    const ignoredPlaceholders = new Set<string>();
    const eachScopes: Array<string | null> = [];

    const markPath = (rawPath: string) => {
      const canonicalPath = this.resolveTemplatePath(rawPath, eachScopes);

      if (!canonicalPath) {
        if (this.shouldReportIgnored(rawPath)) {
          ignoredPlaceholders.add(rawPath.trim());
        }
        return;
      }

      this.markCanonicalPath(canonicalPath, detectedSections, detectedFields);
    };

    for (const match of html.matchAll(TEMPLATE_TOKEN_PATTERN)) {
      const token = (match[1] ?? '').trim();
      if (!token) continue;

      if (token.startsWith('#each ')) {
        const rawPath = token.slice(6).trim();
        const canonicalPath = this.resolveTemplatePath(rawPath, eachScopes);

        if (canonicalPath) {
          this.markCanonicalPath(
            canonicalPath,
            detectedSections,
            detectedFields,
          );
        } else if (this.shouldReportIgnored(rawPath)) {
          ignoredPlaceholders.add(rawPath);
        }

        eachScopes.push(canonicalPath);
        continue;
      }

      if (token === '/each') {
        eachScopes.pop();
        continue;
      }

      if (token.startsWith('#if ')) {
        markPath(token.slice(4).trim());
        continue;
      }

      if (token.startsWith('#') || token.startsWith('/')) {
        continue;
      }

      markPath(token);
    }

    for (const match of html.matchAll(SECTION_MARKUP_PATTERN)) {
      const key = (match[1] ?? '').trim();
      if (RESUME_SECTION_KEYS.includes(key as ResumeSectionKey)) {
        detectedSections.add(key as ResumeSectionKey);
      }
    }

    if (PHOTO_MARKUP_PATTERN.test(html)) {
      detectedSections.add('personal');
      detectedFields.add('personal.photoFileId');
    }

    const sourceSchema = this.mergeWithCatalog(currentSchema);

    const fieldSchema: ResumeTemplateFieldSchema = {
      version: 1,
      sections: sourceSchema.sections.map((section) => {
        const fields = (section.fields ?? []).map((field) => {
          const enabled = detectedFields.has(field.key);

          return {
            ...field,
            enabled,
            required: enabled ? field.required : false,
            hidden: enabled ? field.hidden : false,
          };
        });

        const hasDetectedField = fields.some((field) => field.enabled);
        const enabled = detectedSections.has(section.key) || hasDetectedField;

        return {
          ...section,
          enabled,
          required: enabled ? section.required : false,
          hidden: enabled ? section.hidden : false,
          fields,
        };
      }),
    };

    return {
      fieldSchema,
      detectedSectionKeys: RESUME_SECTION_KEYS.filter((key) =>
        detectedSections.has(key),
      ),
      detectedFieldKeys: Array.from(detectedFields).sort(),
      ignoredPlaceholders: Array.from(ignoredPlaceholders).sort(),
    };
  }

  private resolveTemplatePath(
    rawPath: string,
    eachScopes: Array<string | null>,
  ): string | null {
    let path = rawPath.trim();
    if (!path || path === '@index') return null;

    if (path === 'this' || path === '.') {
      const current = eachScopes[eachScopes.length - 1] ?? null;
      return current && RESUME_ALLOWED_FIELD_KEYS.has(current) ? current : null;
    }

    if (path.startsWith('@root.')) {
      return this.normalizeCanonicalPath(path.slice(6));
    }

    let parentDepth = 0;
    while (path.startsWith('../')) {
      parentDepth += 1;
      path = path.slice(3);
    }

    if (!path || path === '@index') return null;

    if (this.looksRootScoped(path)) {
      return this.normalizeCanonicalPath(path);
    }

    const scopeIndex = eachScopes.length - 1 - parentDepth;
    const scope = scopeIndex >= 0 ? eachScopes[scopeIndex] : null;

    if (scope) {
      const candidate = this.normalizeCanonicalPath(`${scope}.${path}`);
      if (candidate) return candidate;
    }

    return this.normalizeCanonicalPath(path);
  }

  private normalizeCanonicalPath(path: string): string | null {
    const normalized = path.trim().replace(/^\.+|\.+$/g, '');
    if (!normalized) return null;

    if (normalized === 'personal.photoUrl') {
      return 'personal.photoFileId';
    }

    if (RESUME_SECTION_KEYS.includes(normalized as ResumeSectionKey)) {
      return normalized;
    }

    if (RESUME_ALLOWED_FIELD_KEYS.has(normalized)) {
      return normalized;
    }

    return null;
  }

  private looksRootScoped(path: string): boolean {
    if (path === 'summary' || path === 'skills') return true;
    const firstSegment = path.split('.')[0];
    return RESUME_SECTION_KEYS.includes(firstSegment as ResumeSectionKey);
  }

  private markCanonicalPath(
    canonicalPath: string,
    sections: Set<ResumeSectionKey>,
    fields: Set<string>,
  ) {
    if (RESUME_SECTION_KEYS.includes(canonicalPath as ResumeSectionKey)) {
      sections.add(canonicalPath as ResumeSectionKey);
    }

    if (!RESUME_ALLOWED_FIELD_KEYS.has(canonicalPath)) return;

    fields.add(canonicalPath);
    const sectionKey = canonicalPath.includes('.')
      ? canonicalPath.split('.')[0]
      : canonicalPath;

    if (RESUME_SECTION_KEYS.includes(sectionKey as ResumeSectionKey)) {
      sections.add(sectionKey as ResumeSectionKey);
    }
  }

  private shouldReportIgnored(path: string): boolean {
    const value = path.trim();
    return Boolean(
      value &&
        value !== 'this' &&
        value !== '.' &&
        value !== '@index' &&
        !value.startsWith('@'),
    );
  }

  private mergeWithCatalog(
    currentSchema?: ResumeTemplateFieldSchema,
  ): ResumeTemplateFieldSchema {
    const catalog = this.cloneSchema(DEFAULT_RESUME_FIELD_SCHEMA);
    if (!currentSchema) return catalog;

    const currentSections = new Map(
      currentSchema.sections.map((section) => [section.key, section]),
    );

    return {
      version: 1,
      sections: catalog.sections.map((catalogSection) => {
        const currentSection = currentSections.get(catalogSection.key);
        if (!currentSection) return catalogSection;

        const currentFields = new Map(
          (currentSection.fields ?? []).map((field) => [field.key, field]),
        );

        return {
          ...catalogSection,
          ...currentSection,
          fields: (catalogSection.fields ?? []).map((catalogField) => ({
            ...catalogField,
            ...(currentFields.get(catalogField.key) ?? {}),
            // Stable keys/types come from the backend catalog, never template input.
            key: catalogField.key,
            type: catalogField.type,
            aiAssist: catalogField.aiAssist,
          })),
        };
      }),
    };
  }

  private cloneSchema(
    schema: ResumeTemplateFieldSchema,
  ): ResumeTemplateFieldSchema {
    return JSON.parse(JSON.stringify(schema)) as ResumeTemplateFieldSchema;
  }
}
