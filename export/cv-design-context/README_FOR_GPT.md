# Italir Pothe CV Design Context

This package contains the backend CV and Resume Studio implementation plus the eight supplied CV design references.

## Goal

Use the reference pages to implement accurate, production-ready Resume Studio templates without hard-coding the sample candidate's personal information. Preserve the existing backend architecture, security rules, pagination behavior, and dynamic Handlebars-style field contract.

## Design references

- `reference/cv-designs.docx` is the exported Google document.
- `reference/cv-designs.pdf` contains all eight CV designs.
- `reference/page-1.png` through `reference/page-8.png` are the individual full-page visual references.

## Primary backend implementation

- `backend/src/resume-studio/` contains the HTML/CSS template system, field catalog, validation, rendering, pagination, security, storage, controllers, and tests.
- `backend/src/cv-generations/` contains the validated CV payload and image-generation flow.
- `backend/src/cv-assistant/` contains conversational collection, template analysis, and question planning.
- `backend/src/cv-templates/` contains the legacy CV-template API.
- `backend/assets/resume-studio/cv-preview-profile.png` is the fictional AI-generated profile portrait used by photo-enabled template previews when no preview photo is supplied.

## Important entry points

- Field model: `backend/src/resume-studio/types/resume-data.types.ts`
- Allowed fields and builder schema: `backend/src/resume-studio/constants/resume-field-catalog.ts`
- Input normalization: `backend/src/resume-studio/services/resume-schema.service.ts`
- Template rendering: `backend/src/resume-studio/services/resume-renderer.service.ts`
- Template engine: `backend/src/resume-studio/services/resume-template-engine.service.ts`
- Template security: `backend/src/resume-studio/services/resume-template-security.service.ts`
- Template administration and contract: `backend/src/resume-studio/services/resume-template.service.ts`
- Legacy validated CV payload: `backend/src/cv-generations/dto/cv-data.dto.ts`

## Relevant supported fields

The backend supports identity, professional title, contact details, photo, location, availability, summary/profile, structured work experience, structured education, basic skills, skills with proficiency levels, languages with proficiency, driving-licence categories, and repeatable additional information.

Use these newer fields where the reference design requires them:

- `personal.availability`
- `skillProficiencies[]` with `name` and `proficiency`
- `additionalInformation[]`
- `personal.drivingLicense[]`

## Template constraints

- Use only the backend-supported placeholders and sections.
- Do not hard-code the sample name, phone, email, employment, education, or other personal content from the reference images.
- Use the bundled preview portrait for template previews only. A real candidate's uploaded profile photo must always take priority.
- Do not add JavaScript, event handlers, external imports, or hard-coded remote asset URLs.
- Preserve A4 sizing, safe page breaks, long-content handling, optional/empty-section behavior, and profile-photo cropping.
- The backend Chromium renderer is the source of truth.
- Existing tests show expected normalization, template-engine, security, and pagination behavior.

No environment files, credentials, dependencies, build output, or unrelated application modules are included.
