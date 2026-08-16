export const RESUME_SECTION_KEYS = [
  'personal',
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'languages',
  'certifications',
  'references',
] as const;

export type ResumeSectionKey = (typeof RESUME_SECTION_KEYS)[number];

export const RESUME_FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'phone',
  'url',
  'date',
  'image',
  'repeatable',
  'select',
  'tags',
  'boolean',
] as const;

export type ResumeFieldType = (typeof RESUME_FIELD_TYPES)[number];

export const RESUME_TEMPLATE_LAYOUTS = [
  'single-column',
  'two-column',
  'custom',
] as const;

export type ResumeTemplateLayout = (typeof RESUME_TEMPLATE_LAYOUTS)[number];

export const RESUME_SIDEBAR_CONTINUATIONS = [
  'not-applicable',
  'template-managed',
] as const;

export type ResumeSidebarContinuation =
  (typeof RESUME_SIDEBAR_CONTINUATIONS)[number];

export interface ResumeFieldDefinition {
  key: string;
  label: string;
  type: ResumeFieldType;
  enabled: boolean;
  required?: boolean;
  hidden?: boolean;
  maxLength?: number;
  maxItems?: number;
  options?: string[];
  aiAssist?:
    | 'summary-suggestions'
    | 'description-suggestions'
    | 'highlight-suggestions'
    | 'technical-skill-suggestions';
}

export interface ResumeSectionDefinition {
  key: ResumeSectionKey;
  label: string;
  enabled: boolean;
  required?: boolean;
  hidden?: boolean;
  order: number;
  zone?: 'header' | 'main' | 'sidebar' | 'footer';
  maxItems?: number;
  fields?: ResumeFieldDefinition[];
}

export interface ResumeTemplateFieldSchema {
  version: 1;
  sections: ResumeSectionDefinition[];
}

export interface ResumeRendererConfig {
  layout: ResumeTemplateLayout;
  sidebarContinuation: ResumeSidebarContinuation;
  recommendedMaxPages: number;
  hardMaxPages: number;
  locale?: string;
}
