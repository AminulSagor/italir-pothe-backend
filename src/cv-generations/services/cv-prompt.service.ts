import { Injectable } from '@nestjs/common';

import { CvDataDto } from '../dto/cv-data.dto';

@Injectable()
export class CvPromptService {
  buildTemplatePrompt(cvData: CvDataDto, hasProfilePhoto: boolean): string {
    const candidateData = this.serializeCvData(cvData);

    return `
Create one finished, professional CV page in portrait orientation.

REFERENCE IMAGES:
- Reference image 1 is the selected CV design template.
${
  hasProfilePhoto
    ? '- Reference image 2 is the candidate profile photograph.'
    : '- No candidate profile photograph was provided.'
}

DESIGN REQUIREMENTS:
- Use reference image 1 as the visual design reference.
- Closely preserve its overall layout, section positions, columns, spacing,
  alignment, visual hierarchy, typography style, borders, icons and colors.
- Replace every sample name, sample contact detail, placeholder paragraph,
  fake work history and fake education entry with the candidate data below.
- Do not copy any sample personal information from the reference.
- Keep the final output as one clean CV page.
- Do not produce a photograph of paper, a mockup, a desk scene, a frame,
  hands, shadows outside the page or any surrounding environment.
- The output must contain only the CV page.

TEXT ACCURACY:
- Use only the candidate information supplied below.
- Do not invent employers, dates, degrees, qualifications, skills,
  achievements, addresses, contact details or references.
- Render names, email addresses, telephone numbers, dates and URLs exactly.
- Do not replace provided facts with more impressive alternatives.
- Omit sections that contain no information.
- Use concise formatting when necessary, but do not change factual meaning.
- Ensure all text is readable and does not overlap or leave the page.
- Keep headings and body text professionally aligned.
- Avoid decorative text effects that reduce readability.

PROFILE PHOTO:
${
  hasProfilePhoto
    ? `- Use reference image 2 only as the candidate portrait.
- Preserve the person's identity and facial appearance.
- Crop it professionally to fit the portrait area of the template.
- Do not replace the person, change identity or invent clothing details unnecessarily.`
    : `- Do not invent or add a profile photograph.
- If the template contains a sample photograph, remove it or replace that area
  with a clean design element appropriate to the template.`
}

CANDIDATE DATA:
${candidateData}
`.trim();
  }

  buildScratchPrompt(params: {
    cvData: CvDataDto;
    style?: string | null;
    colorTheme?: string | null;
    hasProfilePhoto: boolean;
  }): string {
    const style = params.style?.trim() || 'modern professional';
    const colorTheme = params.colorTheme?.trim() || 'clean neutral';
    const candidateData = this.serializeCvData(params.cvData);

    return `
Create one complete, professional CV page in portrait orientation.

DESIGN DIRECTION:
- Style: ${style}
- Color theme: ${colorTheme}
- Create a polished CV suitable for international job applications.
- Use a strong hierarchy, balanced spacing, readable typography,
  consistent alignment and a clean professional layout.
- The output must contain only the CV page.
- Do not show a desk, frame, hand, device, mockup, surrounding background
  or paper photographed in a scene.
- Avoid excessively decorative graphics.
- Ensure the page remains readable digitally and when printed.

TEXT ACCURACY:
- Use only the candidate information supplied below.
- Do not invent employers, dates, degrees, skills, achievements,
  certifications, addresses, contact information or references.
- Render the full name, email, telephone number, dates and URLs exactly.
- Omit empty optional sections.
- Keep all text inside the page with no overlap or clipping.
- Use concise formatting where needed without changing factual meaning.

PROFILE PHOTO:
${
  params.hasProfilePhoto
    ? `- Reference image 1 is the candidate's profile photograph.
- Include it as a professional portrait in the CV.
- Preserve the person's identity and facial appearance.
- Use a clean crop and do not substantially alter the face.`
    : `- No profile photograph was provided.
- Do not invent or add a person or portrait.`
}

CANDIDATE DATA:
${candidateData}
`.trim();
  }

  private serializeCvData(cvData: CvDataDto): string {
    const cleanedData = this.removeEmptyValues(cvData);

    return JSON.stringify(cleanedData, null, 2);
  }

  private removeEmptyValues(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.removeEmptyValues(item))
        .filter((item) => {
          if (item === undefined || item === null || item === '') {
            return false;
          }

          if (Array.isArray(item)) {
            return item.length > 0;
          }

          if (typeof item === 'object') {
            return Object.keys(item as object).length > 0;
          }

          return true;
        });
    }

    if (value && typeof value === 'object') {
      const cleanedEntries = Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, this.removeEmptyValues(item)])
        .filter(([, item]) => {
          if (item === undefined || item === null || item === '') {
            return false;
          }

          if (Array.isArray(item)) {
            return item.length > 0;
          }

          if (typeof item === 'object') {
            return Object.keys(item as object).length > 0;
          }

          return true;
        });

      return Object.fromEntries(cleanedEntries);
    }

    return value;
  }
}
