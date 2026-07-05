import { Injectable, Logger } from '@nestjs/common';

import type { CvTemplate } from 'src/cv-templates/entities/cv-template.entity';

import { CvAssistantOpenAiService } from './cv-assistant-openai.service';
import type { CvTemplateAnalysis } from './cv-question-planner.service';

@Injectable()
export class CvTemplateAnalysisService {
  private readonly logger = new Logger(CvTemplateAnalysisService.name);

  constructor(private readonly openAiService: CvAssistantOpenAiService) {}

  async analyze(template: CvTemplate): Promise<CvTemplateAnalysis> {
    try {
      return await this.openAiService.analyzeTemplate(template.imageUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      this.logger.warn(
        `Template ${template.id} analysis failed; using fallback: ${message}`,
      );

      return {
        layoutStyle: 'professional',
        colorPalette: [],
        detectedSections: [],
        sectionOrder: [],
        hasProfilePhotoArea: false,
        notes:
          `Selected template: ${template.name}. ` +
          `Visual analysis was unavailable, so the assistant ` +
          `should collect standard CV information and preserve ` +
          `the template during final generation.`,
      };
    }
  }
}
