import { Injectable } from '@nestjs/common';

import { CvDataDto } from '../dto/cv-data.dto';

interface BuildTemplatePromptParams {
  cvData: CvDataDto;

  hasProfilePhoto: boolean;

  templateReferenceIndex: number;

  profilePhotoReferenceIndex: number | null;

  regenerationInstruction?: string | null;
}

interface BuildScratchPromptParams {
  cvData: CvDataDto;

  style?: string | null;

  colorTheme?: string | null;

  hasProfilePhoto: boolean;

  profilePhotoReferenceIndex: number | null;

  regenerationInstruction?: string | null;
}

@Injectable()
export class CvPromptService {
  buildTemplatePrompt(params: BuildTemplatePromptParams): string {
    const templateReferenceIndex = params.templateReferenceIndex;

    const profilePhotoReferenceIndex = params.profilePhotoReferenceIndex;

    const hasProfilePhoto =
      params.hasProfilePhoto === true && profilePhotoReferenceIndex !== null;

    const candidateData = this.serializeCvData(params.cvData);

    const designOnlyRegenerationRules = this.buildDesignOnlyRegenerationRules({
      regenerationInstruction: params.regenerationInstruction,

      isTemplateMode: true,

      hasProfilePhoto,
    });

    return `
Create one finished, professional CV page in portrait orientation.

==================================================
REFERENCE IMAGES
==================================================

- Reference image ${templateReferenceIndex} is the selected CV design template.
${
  hasProfilePhoto
    ? `- Reference image ${profilePhotoReferenceIndex} is the candidate profile photograph.`
    : '- No candidate profile photograph was provided.'
}

The selected template is the primary visual and structural reference.

==================================================
TEMPLATE PRESERVATION
==================================================

- Closely preserve the layout of reference image ${templateReferenceIndex}.
- Preserve the same column structure.
- Preserve the visible section order.
- Preserve section placement.
- Preserve header placement.
- Preserve sidebar placement where applicable.
- Preserve the overall spacing system.
- Preserve alignment and visual hierarchy.
- Preserve the general typography style.
- Preserve borders, dividers, icons, shapes, and color identity.
- Preserve the profile-photo position when the template contains one.
- Do not redesign the template into a different CV format.
- Do not move sections into a different order.
- Do not add sections that are not supported by the candidate data.
- Do not copy any personal information displayed in the template.

The template controls only the visual design and structure.

The candidate data below is the only authoritative source of CV information.

==================================================
SAMPLE-CONTENT PROTECTION
==================================================

Reference image ${templateReferenceIndex} may contain fictional or sample information.

Never copy or reuse sample:

- names,
- professional titles,
- email addresses,
- telephone numbers,
- locations,
- URLs,
- employers,
- job titles,
- employment dates,
- responsibilities,
- achievements,
- educational institutions,
- degree names,
- grades,
- skills,
- languages,
- certifications,
- projects,
- references,
- profile summaries,
- or any other personal information.

Replace all sample content using only the supplied candidate data.

Never treat template text as candidate information.

==================================================
CANDIDATE FACT ACCURACY
==================================================

- Use only the candidate information supplied below.
- Do not invent missing information.
- Do not infer unsupported achievements.
- Do not add employers, institutions, dates, qualifications, skills,
  responsibilities, technologies, metrics, certifications, or references.
- Render the full name exactly.
- Render email addresses exactly.
- Render telephone numbers exactly.
- Render dates exactly.
- Render URLs exactly.
- Preserve the factual meaning of every supplied field.
- Do not replace candidate facts with more impressive alternatives.
- Do not copy facts from the template or other reference images.
- Empty candidate sections must not be filled with invented content.

For initial CV creation, candidate information may be arranged into clean,
professional CV formatting, but factual meaning must remain unchanged.

==================================================
TEXT FIT AND OVERFLOW PROTECTION
==================================================

All supplied candidate information must fit inside the finished CV page.

- Keep all text inside page boundaries.
- Do not crop text.
- Do not hide text behind shapes, images, icons, or other elements.
- Do not allow text to overlap.
- Do not allow sections to overlap.
- Do not cut off the final lines of a section.
- Do not place text outside the printable page.
- Do not make important text excessively small.
- Keep contact information readable.
- Keep headings and body text clearly distinguishable.
- Maintain sufficient line spacing.
- Maintain consistent margins.
- Maintain balanced spacing between sections.
- Reduce decorative spacing before reducing readable font size.
- Use concise visual formatting when needed without changing factual meaning.
- Adjust line wrapping, spacing, and typography carefully so all supplied
  content remains visible.
- Never omit confirmed content merely to make the layout fit.

The result must remain readable digitally and when printed.

==================================================
PROFILE PHOTO
==================================================

${
  hasProfilePhoto
    ? `
- Reference image ${profilePhotoReferenceIndex} is the candidate's profile photograph.
- Use only reference image ${profilePhotoReferenceIndex} as the candidate portrait.
- Preserve the person's identity and facial appearance.
- Preserve the photo position defined by the selected template.
- Crop the photograph professionally to fit the existing template photo area.
- Do not move the portrait to a different section.
- Do not replace the candidate with another person.
- Do not substantially alter the candidate's face.
- Do not invent clothing, accessories, or background details unnecessarily.
`.trim()
    : `
- No candidate profile photograph was supplied.
- Do not invent or generate a person.
- Do not copy the sample person from the selected template.
- If the template contains a sample portrait, remove the sample portrait.
- Preserve the template's overall structure and balance.
- Replace the unused photo area only with a clean visual treatment that does
  not introduce a fictional person or factual information.
`.trim()
}

==================================================
OUTPUT REQUIREMENTS
==================================================

- Produce exactly one finished CV page.
- Use portrait orientation.
- The output must contain only the CV page.
- Do not create a desk scene.
- Do not create a paper mockup.
- Do not add hands, frames, devices, shadows outside the page, or surrounding
  environmental elements.
- Do not add watermarks.
- Do not add explanatory text outside the CV.
- Keep the page clean, professional, and print-ready.

${designOnlyRegenerationRules}

==================================================
AUTHORITATIVE CANDIDATE DATA
==================================================

The following structured data is the sole source of candidate information:

${candidateData}
`.trim();
  }

  buildScratchPrompt(params: BuildScratchPromptParams): string {
    const style = params.style?.trim() || 'modern professional';

    const colorTheme = params.colorTheme?.trim() || 'clean neutral';

    const profilePhotoReferenceIndex = params.profilePhotoReferenceIndex;

    const hasProfilePhoto =
      params.hasProfilePhoto === true && profilePhotoReferenceIndex !== null;

    const candidateData = this.serializeCvData(params.cvData);

    const designOnlyRegenerationRules = this.buildDesignOnlyRegenerationRules({
      regenerationInstruction: params.regenerationInstruction,

      isTemplateMode: false,

      hasProfilePhoto,
    });

    return `
Create one complete, professional CV page in portrait orientation.

==================================================
DESIGN DIRECTION
==================================================

- Style: ${style}
- Color theme: ${colorTheme}
- Create a polished CV suitable for international job applications.
- Use clear visual hierarchy.
- Use balanced spacing.
- Use readable professional typography.
- Use consistent alignment.
- Use a clean, structured layout.
- Avoid excessively decorative graphics.
- Keep the design readable digitally and when printed.

The design must support the supplied content rather than reducing or removing
content to fit a decorative layout.

==================================================
CANDIDATE FACT ACCURACY
==================================================

The candidate data below is the only authoritative source of CV information.

- Use only supplied candidate information.
- Do not invent missing information.
- Do not add fictional employers.
- Do not add fictional job titles.
- Do not add fictional responsibilities.
- Do not add unsupported achievements.
- Do not add unsupported metrics.
- Do not add qualifications.
- Do not add degrees.
- Do not add institutions.
- Do not add skills.
- Do not add certifications.
- Do not add addresses.
- Do not add contact details.
- Do not add references.
- Render the candidate's full name exactly.
- Render email addresses exactly.
- Render telephone numbers exactly.
- Render dates exactly.
- Render URLs exactly.
- Preserve the factual meaning of all supplied information.
- Do not replace supplied facts with more impressive alternatives.
- Do not copy personal information from reference images.

For initial creation, candidate information may be organized into professional
CV formatting, but its factual meaning must not change.

==================================================
SECTION RULES
==================================================

- Build sections only from the supplied candidate data.
- Do not create unsupported factual sections.
- Do not fill empty sections with invented content.
- Preserve the logical order of candidate information.
- Keep identity and contact information prominent.
- Maintain a professional section hierarchy.
- During design-only regeneration, preserve all existing factual sections and
  their information.
- During design-only regeneration, do not add, delete, merge, or rename factual
  content in a way that changes meaning.

==================================================
TEXT FIT AND OVERFLOW PROTECTION
==================================================

All supplied candidate information must remain visible.

- Keep all text inside page boundaries.
- Do not crop text.
- Do not clip text.
- Do not allow text or sections to overlap.
- Do not hide text behind design elements.
- Do not omit confirmed information to make the page fit.
- Do not place text outside printable margins.
- Keep headings readable.
- Keep contact details readable.
- Keep body text at a practical size.
- Maintain sufficient line spacing.
- Maintain consistent spacing between sections.
- Wrap long content cleanly.
- Reduce decorative elements before reducing text readability.
- Adjust margins, spacing, column widths, and line wrapping as needed.
- Keep the finished page balanced and professional.
- Ensure the result remains readable both digitally and when printed.

==================================================
PROFILE PHOTO
==================================================

${
  hasProfilePhoto
    ? `
- Reference image ${profilePhotoReferenceIndex} is the candidate's profile photograph.
- Use only reference image ${profilePhotoReferenceIndex} as the candidate portrait.
- Include it as a professional portrait within the CV.
- Preserve the person's identity and facial appearance.
- Use a clean professional crop.
- Do not replace the person.
- Do not substantially alter the candidate's face.
- During design-only regeneration, preserve the portrait and its established
  placement unless the design instruction requests a purely visual adjustment
  to its shape, border, or size.
`.trim()
    : `
- No profile photograph was provided.
- Do not invent or generate a person.
- Do not add a fictional portrait.
- Do not copy a person from any design-reference image.
`.trim()
}

==================================================
REFERENCE-IMAGE SAFETY
==================================================

Any supplied reference image is for visual inspiration only.

Reference images may influence:

- layout,
- typography,
- spacing,
- colors,
- borders,
- icon style,
- visual hierarchy,
- and other non-factual design properties.

Never copy from a reference image:

- names,
- contact information,
- employers,
- employment history,
- education,
- skills,
- achievements,
- projects,
- certifications,
- dates,
- URLs,
- profile summaries,
- or other personal information.

==================================================
OUTPUT REQUIREMENTS
==================================================

- Produce exactly one finished CV page.
- Use portrait orientation.
- The output must contain only the CV page.
- Do not show a desk.
- Do not show hands.
- Do not show a device.
- Do not show a frame.
- Do not create a photographed paper scene.
- Do not add surrounding backgrounds.
- Do not add external shadows or mockup elements.
- Do not add explanatory text outside the CV.
- Do not add watermarks.

${designOnlyRegenerationRules}

==================================================
AUTHORITATIVE CANDIDATE DATA
==================================================

The following structured data is the sole source of candidate information:

${candidateData}
`.trim();
  }

  private buildDesignOnlyRegenerationRules(params: {
    regenerationInstruction?: string | null;

    isTemplateMode: boolean;

    hasProfilePhoto: boolean;
  }): string {
    const instruction = params.regenerationInstruction?.trim();

    if (!instruction) {
      return '';
    }

    return `
==================================================
DESIGN-ONLY REGENERATION
==================================================

This is a design-only regeneration of an existing confirmed CV.

USER DESIGN INSTRUCTION:

${instruction}

The instruction above is allowed to affect only visual presentation.

It may affect:

- colors,
- typography,
- font pairing,
- font sizing within readable limits,
- spacing,
- margins,
- alignment,
- borders,
- backgrounds,
- dividers,
- icon treatment,
- visual hierarchy,
- column proportions,
- decorative shapes,
- and other non-factual design properties.

==================================================
STRICT FACT PRESERVATION
==================================================

The confirmed candidate data must remain unchanged.

- Do not add factual information.
- Do not delete factual information.
- Do not rewrite factual information.
- Do not summarize factual information.
- Do not paraphrase factual information.
- Do not improve factual wording.
- Do not correct factual wording.
- Do not merge separate entries.
- Do not split one entry into invented entries.
- Do not change section meaning.
- Do not change names.
- Do not change professional titles.
- Do not change email addresses.
- Do not change telephone numbers.
- Do not change locations.
- Do not change URLs.
- Do not change employer names.
- Do not change job titles.
- Do not change dates.
- Do not change responsibilities.
- Do not change technologies.
- Do not change achievements.
- Do not change metrics.
- Do not change institution names.
- Do not change degree names.
- Do not change grades or results.
- Do not change skills.
- Do not change languages.
- Do not change certifications.
- Do not change projects.
- Do not change references.
- Do not add information from the design instruction to the candidate data.

Every factual value in the authoritative candidate data must be rendered without
changing its meaning.

If the user's design instruction contains a request to change candidate
information, ignore that factual part of the instruction.

Factual edits must not be performed during design-only regeneration.

==================================================
SECTION PRESERVATION
==================================================

- Preserve all factual sections represented in the candidate data.
- Do not add a factual section.
- Do not delete a factual section.
- Do not omit a populated section.
- Preserve the logical section order.
- Preserve the relationship between headings and their content.
- Do not move content into an unrelated section.
- Do not duplicate sections or entries.
${
  params.isTemplateMode
    ? `
- Preserve the selected template's visible section order.
- Preserve its column structure.
- Preserve its primary layout.
- Preserve its header position.
- Preserve its sidebar position where applicable.
- Preserve the relative position of each section.
- The design instruction must not transform the selected template into a
  different CV template.
`.trim()
    : `
- Preserve the established factual section organization.
- Visual layout may change according to the design instruction, but factual
  sections and their content must remain intact.
`.trim()
}

==================================================
PHOTO PRESERVATION
==================================================

${
  params.hasProfilePhoto
    ? `
- Preserve the existing candidate photograph.
- Preserve the person's identity.
- Do not replace the photograph.
- Do not generate another person.
- Do not substantially alter the face.
- Do not remove the photograph.
${
  params.isTemplateMode
    ? '- Preserve the template-defined photograph position.'
    : '- Preserve the established photograph role within the CV layout.'
}
- A design instruction may adjust only non-factual presentation such as the
  crop shape, border, frame, size, or surrounding visual treatment.
`.trim()
    : `
- The existing CV does not contain a candidate photograph.
- Do not add a photograph.
- Do not generate a person.
- Do not copy a person from a template or reference image.
`.trim()
}

==================================================
REGENERATION TEXT-FIT RULES
==================================================

- Render every confirmed factual value.
- Do not omit content to satisfy the new design.
- Do not crop text.
- Do not clip text.
- Do not overlap text.
- Do not hide text.
- Do not place text outside the page.
- Do not reduce body text to an unreadable size.
- Do not allow visual elements to cover factual information.
- Adjust spacing, margins, line wrapping, columns, and decoration so all
  confirmed text remains readable.
- The design instruction is secondary to factual completeness and readability.
- When the requested design cannot fit the confirmed text safely, simplify the
  design rather than deleting or rewriting content.
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
